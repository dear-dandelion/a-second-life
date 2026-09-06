import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEMO_EMAIL = 'demo@suiyue.local';
const APPLY = process.argv.includes('--apply');

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
  }));
}

const env = parseEnv(await readFile(resolve('.env'), 'utf8'));
const baseUrl = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!baseUrl || !serviceKey) throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。');

function previousMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

function isoDate(month, day) {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const month = previousMonth();
const monthStart = isoDate(month, 1);
const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
const days = [1, 2, 3, 5, 6, 8, 9, 11, 13, 15, 16, 18, 20, 22, 24, 26, 28, 30];

const records = days.map((day, index) => ({
  date: isoDate(month, day),
  sleep: { quality: index % 6 === 0 ? '差' : index % 3 === 0 ? '一般' : '好', night_wakes: index % 6 === 0 ? 3 : index % 3 === 0 ? 1 : 0, detail: index % 6 === 0 ? '夜间易醒，醒后较难再次入睡。' : '作息较规律。' },
  mood: index % 5 === 0 ? { state: index % 10 === 0 ? '焦虑' : '低落', intensity: '明显', description: '有些疲惫', trigger: '工作和家务较多', source: 'manual' } : { state: index % 2 ? '平静' : '舒展', description: index % 2 ? '平静' : '轻松', trigger: '安排了自己的休息时间', source: 'manual' },
  hotFlash: [1, 3, 6, 8, 11, 13, 16].includes(index) ? { frequency_count: index % 3 + 1, severity: index % 2 ? '轻' : '中', trend: index > 11 ? '减轻' : '稳定' } : null,
  exercise: [2, 5, 8, 11, 14, 16, 17].includes(index) ? { type: index % 2 ? '散步' : '八段锦', duration: index % 2 ? '30分钟' : '15分钟', frequency: '本周 2–3 次', intensity: '轻松' } : null,
}));

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} 失败：${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const users = await api(`/auth/v1/admin/users?email=${encodeURIComponent(DEMO_EMAIL)}`);
const user = users.users?.find((item) => item.email === DEMO_EMAIL);
if (!user) throw new Error(`未找到演示账号 ${DEMO_EMAIL}，请先在 Supabase Authentication 中创建并确认该账号。`);

console.log(`目标账号：${DEMO_EMAIL}`);
console.log(`目标月份：${monthStart.slice(0, 7)}；将写入 ${records.length} 天记录。`);
console.log('预期月度聚合：18 天已记录、14 天舒展/平静心情、14 次潮热、7 天运动。');
if (!APPLY) {
  console.log('这是预览；确认写入请运行：node scripts/seed-monthly-demo.mjs --apply');
  process.exit(0);
}

const existing = await api(`/rest/v1/health_records?user_id=eq.${user.id}&record_date=gte.${monthStart}&record_date=lte.${monthEnd}&select=id`);
const existingIds = existing.map((item) => item.id);
const childTables = ['symptom_records', 'sleep_records', 'mood_records', 'menstrual_records', 'weight_records', 'exercise_records', 'diet_records', 'medication_mentions', 'life_event_records'];
if (existingIds.length) {
  const filter = `record_id=in.(${existingIds.join(',')})`;
  await Promise.all(childTables.map((table) => api(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })));
}

const saved = await api('/rest/v1/health_records?on_conflict=user_id,record_date', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(records.map((record) => ({ user_id: user.id, record_date: record.date, appetite: null, medical_needs: null, other: null }))),
});
const idByDate = new Map(saved.map((record) => [record.record_date, record.id]));
const sleepRows = records.map((record) => ({ record_id: idByDate.get(record.date), ...record.sleep }));
const moodRows = records.map((record) => ({
  record_id: idByDate.get(record.date), state: record.mood.state,
  intensity: record.mood.intensity ?? null, description: record.mood.description ?? '',
  trigger: record.mood.trigger ?? null, source: record.mood.source ?? 'manual',
  confidence: null, quote: null,
}));
const symptomRows = records.filter((record) => record.hotFlash).map((record) => ({ record_id: idByDate.get(record.date), symptom: '潮热', occurred: true, frequency: '偶尔', quote: '月度聚合测试数据', ...record.hotFlash }));
const exerciseRows = records.filter((record) => record.exercise).map((record) => ({ record_id: idByDate.get(record.date), ...record.exercise }));
await Promise.all([
  api('/rest/v1/sleep_records', { method: 'POST', body: JSON.stringify(sleepRows) }),
  api('/rest/v1/mood_records', { method: 'POST', body: JSON.stringify(moodRows) }),
  api('/rest/v1/symptom_records', { method: 'POST', body: JSON.stringify(symptomRows) }),
  api('/rest/v1/exercise_records', { method: 'POST', body: JSON.stringify(exerciseRows) }),
]);

console.log('写入完成。刷新“这个月的我”，切换到上个月即可查看聚合效果。');
