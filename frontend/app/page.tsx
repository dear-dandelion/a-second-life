'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3 as Waves,
  Bone,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardPlus,
  Copy,
  Dumbbell,
  FileText,
  Heart,
  Home,
  LockKeyhole,
  MessageCircle,
  MessageCircleMore,
  Mic,
  Moon,
  Pencil,
  PersonStanding,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  ShoppingBag,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Sun,
  UserPlus,
  UserRound,
  UsersRound,
  Utensils,
  Volume2,
  X,
} from 'lucide-react';
import { signInDemo, useSession } from '@/lib/auth';
import { services } from '@/lib/services';
import { createClientId } from '@/lib/id';
import type { HealthDraftItem, HealthRecordSummary, MonthlyHealthStats, ReportCoverage, ReportDraft, ReportPreview, ReportRange } from '@/lib/contracts';
import type { NavigationTarget } from '@/lib/contracts';
import HealthRecordEditor from '@/components/health-record-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from '@/components/ui/toast';

type View =
  | 'home'
  | 'community'
  | 'messages'
  | 'profile'
  | 'chat'
  | 'health'
  | 'actions'
  | 'month'
  | 'summaries'
  | 'summary'
  | 'range'
  | 'report'
  | 'expression'
  | 'achievements'
  | 'personal';
type ProfileData = {
  birth: string;
  height: string;
  menopausalStatus: '' | '未绝经' | '围绝经期' | '绝经后' | '不确定';
  history: string;
  surgery: string;
  allergies: string;
  regularMedications: string;
  pregnancyHistory: string;
  familyHistory: string;
  screeningHistory: string;
};
type ChatMessage = {
  from: 'ai' | 'me';
  text: string;
  id?: string;
  speakableText?: string;
  navigation?: { target: NavigationTarget; params?: Record<string, string> };
  sources?: Array<{ title: string; sourceUrl?: string }>;
};
type HealthUpdateNotice = { id: string; text: string; recordDate: string };
type AchievementGroup = 'record' | 'streak' | 'study';
type Achievement = {
  id: string;
  name: string;
  description: string;
  group: AchievementGroup;
  achievedAt?: string;
};

const healthCategoryLabels: Record<string, string> = {
  symptom: '症状',
  mood: '心情',
  sleep: '睡眠',
  menstrual: '经期',
  weight: '体重',
  appetite: '食欲',
  exercise: '运动',
  diet: '饮食',
  medication: '用药',
  lifeEvent: '生活事件',
  medicalNeed: '就医需求',
  other: '健康记录',
};
const displayValue = (value: unknown, fallback: string) =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : fallback;
const achievementDefinitions: Array<Omit<Achievement, 'achievedAt'>> = [
  { id: 'record-100', name: '累计记录 100 天', description: '累计完成 100 个不同日期的健康记录。', group: 'record' },
  { id: 'record-365', name: '累计记录 365 天', description: '累计完成 365 个不同日期的健康记录。', group: 'record' },
  { id: 'record-500', name: '累计记录 500 天', description: '累计完成 500 个不同日期的健康记录。', group: 'record' },
  { id: 'record-1000', name: '累计记录 1000 天', description: '累计完成 1000 个不同日期的健康记录。', group: 'record' },
  { id: 'streak-7', name: '连续记录 7 天', description: '连续 7 天各完成至少 1 条健康记录。', group: 'streak' },
  { id: 'streak-30', name: '连续记录 30 天', description: '连续 30 天各完成至少 1 条健康记录。', group: 'streak' },
  { id: 'streak-100', name: '连续记录 100 天', description: '连续 100 天各完成至少 1 条健康记录。', group: 'streak' },
  { id: 'streak-365', name: '连续记录 365 天', description: '连续 365 天各完成至少 1 条健康记录。', group: 'streak' },
  { id: 'study-100', name: '累计学习 100 篇', description: '累计完成 100 篇健康内容阅读后点亮。', group: 'study' },
  { id: 'study-500', name: '累计学习 500 篇', description: '累计完成 500 篇健康内容阅读后点亮。', group: 'study' },
  { id: 'study-1000', name: '累计学习 1000 篇', description: '累计完成 1000 篇健康内容阅读后点亮。', group: 'study' },
  { id: 'study-2000', name: '累计学习 2000 篇', description: '累计完成 2000 篇健康内容阅读后点亮。', group: 'study' },
];
function achievedDateForStreak(dates: string[], target: number) {
  let streak = 0;
  let previous = '';
  for (const date of dates) {
    const consecutive = previous && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === 86_400_000;
    streak = consecutive ? streak + 1 : 1;
    if (streak === target) return date;
    previous = date;
  }
  return undefined;
}
function buildAchievements(records: HealthRecordSummary[]): Achievement[] {
  const dates = [...new Set(records.map((record) => record.date))].sort();
  return achievementDefinitions.map((achievement) => {
    const target = Number(achievement.id.split('-').at(-1));
    const achievedAt = achievement.group === 'record'
      ? dates[target - 1]
      : achievement.group === 'streak'
        ? achievedDateForStreak(dates, target)
        : undefined;
    return { ...achievement, achievedAt };
  });
}
function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>(achievementDefinitions);
  useEffect(() => {
    let active = true;
    services.healthRecords.list().then((records) => {
      if (active) setAchievements(buildAchievements(records));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return achievements;
}
function AchievementIcon({ group }: { group: AchievementGroup }) {
  return group === 'record' ? <Sprout /> : group === 'streak' ? <Sun /> : <FileText />;
}
const shanghaiToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const shanghaiMonth = () => shanghaiToday().slice(0, 7);
const displayDuration = (minutes: number) =>
  `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const max = Math.max(0, ...counts.values());
  return {
    values: [...counts.entries()]
      .filter(([, count]) => count === max)
      .map(([value]) => value),
    count: max,
  };
}
function homeMonthlyOverview(stats: MonthlyHealthStats | null) {
  const days = (stats?.days ?? []).filter((day) => day.date <= shanghaiToday());
  const recordedDays = days.filter((day) => day.hasRecord).length;
  const sleeps = days
    .map((day) => day.sleep)
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const durations = sleeps
    .map((sleep) => Number(sleep.durationMinutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  const qualities = sleeps
    .map((sleep) => asText(sleep.quality))
    .filter(Boolean);
  const quality = mostFrequent(qualities);
  const sleepValue =
    durations.length >= 2
      ? displayDuration(
          Math.round(
            durations.reduce((sum, value) => sum + value, 0) /
              durations.length /
              5,
          ) * 5,
        )
      : sleeps.length
        ? `已记录 ${sleeps.length} 晚`
        : '暂无记录';
  const sleepStatus =
    durations.length >= 2
      ? quality.values.length !== 1
        ? '睡眠有波动'
        : quality.values[0] === '好'
          ? '大多良好'
          : quality.values[0] === '一般'
            ? '整体一般'
            : '睡得不稳'
      : sleeps.length && durations.length === 0
        ? '时长待补'
        : sleeps.length
          ? '正在记录'
          : '今晚记睡眠';
  const moods = days.map((day) => asText(day.mood?.state)).filter(Boolean);
  const mood = mostFrequent(moods);
  const moodName =
    mood.values.length === 1
      ? mood.values[0] === '复杂'
        ? '说不清'
        : mood.values[0]
      : moods.length
        ? '有一些波动'
        : '暂无记录';
  const moodStatus = moods.length ? `已记${moods.length}天` : '说说感受';
  const exerciseDays = days.filter((day) => asText(day.exercise?.type)).length;
  const exerciseDurations = days
    .map((day) => exerciseMinutes(day.exercise?.duration))
    .filter((value): value is number => value !== null);
  const exerciseValue =
    exerciseDays >= 2
      ? `坚持 ${exerciseDays} 天`
      : exerciseDays === 1
        ? '动了 1 天'
        : '从今天动一动';
  const exerciseStatus =
    exerciseDays >= 2 && exerciseDurations.length >= 2
      ? `累计${Math.round(exerciseDurations.reduce((sum, value) => sum + value, 0) / 60)}时`
      : exerciseDays >= 2
        ? '正在记录'
        : exerciseDays === 1
          ? '保持节奏'
          : '去动一动';
  return {
    days,
    recordedDays,
    sleep: { value: sleepValue, status: sleepStatus },
    mood: { value: moodName, status: moodStatus },
    exercise: { value: exerciseValue, status: exerciseStatus },
  };
}
function healthItemSummary(item: HealthDraftItem) {
  const label = healthCategoryLabels[item.category] ?? '健康记录';
  if (item.operation === 'delete') return `已删除${label}`;
  const data = item.data;
  if (typeof data === 'string') return `${label}${data.slice(0, 18)}`;
  if (!data) return `${label}已更新`;
  if (item.category === 'sleep')
    return data.quality
      ? `睡眠质量${displayValue(data.quality, '已更新')}`
      : '睡眠记录已更新';
  if (item.category === 'symptom')
    return `${displayValue(data.symptom, '症状')}${data.occurred === false ? '未发生' : data.severity ? `${displayValue(data.severity, '')}度` : '已记录'}`;
  if (item.category === 'mood')
    return `心情${displayValue(data.label ?? data.state, '已更新')}`;
  if (item.category === 'menstrual')
    return `经期${displayValue(data.event, '已更新')}`;
  if (item.category === 'weight')
    return data.value
      ? `体重${displayValue(data.value, '')}${displayValue(data.unit, 'kg')}`
      : '体重已更新';
  if (item.category === 'exercise')
    return `运动${displayValue(data.type ?? data.name, '已记录')}`;
  if (item.category === 'diet') return '饮食记录已更新';
  if (item.category === 'medication')
    return `${displayValue(data.name, '用药')}${displayValue(data.action, '已记录')}`;
  if (item.category === 'lifeEvent')
    return `生活事件${displayValue(data.description, '已记录').slice(0, 14)}`;
  return `${label}已更新`;
}
function healthUpdateText(recordDate: string, items: HealthDraftItem[]) {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Shanghai',
  });
  const dateLabel =
    recordDate === today
      ? '今日'
      : `${Number(recordDate.slice(5, 7))}月${Number(recordDate.slice(8, 10))}日`;
  const details = items.slice(0, 2).map(healthItemSummary).join('、');
  return `健康卡片已更新：${dateLabel}${details || '健康记录'}${items.length > 2 ? `等${items.length}项` : ''}`;
}

const nav = [
  { view: 'home' as View, label: '今天的我', icon: Home },
  { view: 'community' as View, label: '交流广场', icon: UsersRound },
  { view: 'messages' as View, label: '我的消息', icon: MessageCircleMore },
  { view: 'profile' as View, label: '我的', icon: UserRound },
];
const categories = [
  ['走起来', '每天多走一点，让身体保持流动', PersonStanding],
  ['长肌肉', '慢慢积攒力量，日常更有底气', Dumbbell],
  ['吃得好', '吃得更完整一点，给身体足够营养', Utensils],
  ['骨头好', '给骨骼多一点支持，稳稳走得更远', Bone],
  ['睡得好', '为夜晚留出空间，让休息更踏实', Moon],
  ['心情好', '照顾当下感受，给自己一点松弛', Heart],
] as const;
const posts = [
  {
    name: '温暖的晨光',
    time: '2小时前',
    text: '今天和闺蜜爬山，风很大，却让人心里很通透。更年期让我学会慢下来，也更懂自己。',
    likes: 32,
    comments: 12,
    emoji: '👩🏻',
    image: '山顶的风，也是一种拥抱',
  },
  {
    name: '自在如风',
    time: '5小时前',
    text: '最近开始练八段锦，睡眠改善了不少，整个人也更放松了。分享给同路的姐妹～',
    likes: 28,
    comments: 8,
    emoji: '👩🏽',
    image: null,
  },
  {
    name: '海边的椰子',
    time: '昨天 21:30',
    text: '第一次独自旅行，给自己一个拥抱。中年也可以有很多新的开始。',
    likes: 42,
    comments: 15,
    emoji: '👩🏻‍🦱',
    image: '新的开始，在海边',
  },
];

function StatusBar() {
  return (
    <header className="statusbar">
      <b>9:41</b>
      <span>▮▮▮　◉　▰</span>
    </header>
  );
}
function PageHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <button className="back" onClick={onBack} aria-label="返回">
        <ArrowLeft />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="header-action">{action}</div>
    </div>
  );
}
function DetailWorkspace({
  header,
  children,
  footer,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="detail-workspace">
      {header}
      <div className="detail-scroll">{children}</div>
      {footer && <div className="detail-footer">{footer}</div>}
    </div>
  );
}
function NavBar({ active, onGo }: { active: View; onGo: (v: View) => void }) {
  return (
    <nav className="tabbar" aria-label="主要导航">
      {nav.map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          className={active === view ? 'active' : ''}
          onClick={() => onGo(view)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
function Screen({
  children,
  navActive,
  onGo,
  contentClassName,
}: {
  children: React.ReactNode;
  navActive?: View;
  onGo: (v: View) => void;
  contentClassName?: string;
}) {
  return (
    <section className="phone-shell">
      <StatusBar />
      <div
        className={`screen-scroll${contentClassName ? ` ${contentClassName}` : ''}`}
      >
        {children}
      </div>
      {navActive && <NavBar active={navActive} onGo={onGo} />}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [history, setHistory] = useState<View[]>([]);
  const [dimension, setDimension] = useState('我的潮热');
  const [chart, setChart] = useState(false);
  const [range, setRange] = useState<ReportRange>('6_months');
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportCoverage, setReportCoverage] = useState<ReportCoverage | null>(null);
  const [profile, setProfile] = useState<ProfileData>({
    birth: '1978',
    height: '165',
    menopausalStatus: '围绝经期',
    history: '高血压',
    surgery: '无',
    allergies: '无',
    regularMedications: '',
    pregnancyHistory: '',
    familyHistory: '',
    screeningHistory: '',
  });
  const [profilePrefill, setProfilePrefill] = useState<Record<
    string,
    string
  > | null>(null);
  const [expression, setExpression] = useState('');
  const [polished, setPolished] = useState('');
  const [chatText, setChatText] = useState('');
  const [chatGenerating, setChatGenerating] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: 'ai',
      text: '你好，我是小年。无论是身体变化、心情，还是今天发生的小事，都可以慢慢说。',
    },
  ]);
  const [healthNotice, setHealthNotice] = useState<HealthUpdateNotice | null>(
    null,
  );
  const [healthDate, setHealthDate] = useState<string | undefined>();
  const [demoError, setDemoError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const { session, loading: authLoading } = useSession();
  const realMode = process.env.NEXT_PUBLIC_USE_MOCKS !== 'true';
  const activeNav: View = ['home', 'community', 'messages', 'profile'].includes(
    view,
  )
    ? view
    : 'home';
  const go = (next: View) => {
    setHistory((h) => [...h, view]);
    setView(next);
  };
  const back = () => {
    const prev = history.at(-1) || 'home';
    setHistory((h) => h.slice(0, -1));
    setView(prev);
  };
  const root = (next: View) => {
    setHistory([]);
    setView(next);
  };
  const soon = () =>
    toast.add({ title: '敬请期待', description: '这个功能将在后续版本开放。' });
  useEffect(() => {
    services.profile
      .get()
      .then((value) =>
        setProfile({
          birth: String(value.birthYear ?? ''),
          height: value.heightCm === null ? '' : String(value.heightCm),
          menopausalStatus: value.menopausalStatus,
          history: value.medicalHistory,
          surgery: value.surgeryHistory,
          allergies: value.allergyHistory,
          regularMedications: value.regularMedications,
          pregnancyHistory: value.pregnancyHistory,
          familyHistory: value.familyHistory,
          screeningHistory: value.screeningHistory,
        }),
      )
      .catch(() => undefined);
  }, []);
  useEffect(() => () => chatAbortRef.current?.abort(), []);
  useEffect(() => {
    if (!healthNotice) return;
    const timer = window.setTimeout(
      () =>
        setHealthNotice((current) =>
          current?.id === healthNotice.id ? null : current,
        ),
      5000,
    );
    return () => window.clearTimeout(timer);
  }, [healthNotice]);
  useEffect(() => {
    if (!realMode || session) return;
    let cancelled = false;
    signInDemo().catch(() => {
      if (!cancelled) setDemoError('演示账号暂时不可用，请稍后刷新重试');
    });
    return () => {
      cancelled = true;
    };
  }, [realMode, session]);
  if (realMode && (authLoading || !session))
    return (
      <main className="prototype-stage">
        <Screen navActive="home" onGo={() => {}}>
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--muted)',
            }}
          >
            {demoError ?? '正在进入…'}
          </div>
        </Screen>
      </main>
    );
  const sendChat = async (voiceText?: string) => {
    const text = (voiceText ?? chatText).trim();
    if (!text || chatGenerating) return;
    const clientMessageId = createClientId();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    setChatText('');
    setChatGenerating(true);
    setMessages((m) => [...m, { from: 'me', text }, { from: 'ai', text: '' }]);
    try {
      for await (const event of services.chat.stream(
        text,
        clientMessageId,
        conversationRef.current,
        controller.signal,
      )) {
        if (event.type === 'message_started')
          conversationRef.current = event.data.conversationId;
        if (event.type === 'text_delta')
          setMessages((m) =>
            m.map((message, index) =>
              index === m.length - 1 && message.from === 'ai'
                ? { ...message, text: message.text + event.data.delta }
                : message,
            ),
          );
        if (event.type === 'navigation')
          setMessages((m) =>
            m.map((message, index) =>
              index === m.length - 1 && message.from === 'ai'
                ? { ...message, navigation: event.data }
                : message,
            ),
          );
        if (event.type === 'rag_sources')
          setMessages((m) =>
            m.map((message, index) =>
              index === m.length - 1 && message.from === 'ai'
                ? { ...message, sources: event.data.sources }
                : message,
            ),
          );
        if (event.type === 'message_completed')
          setMessages((m) =>
            m.map((message, index) =>
              index === m.length - 1 && message.from === 'ai'
                ? {
                    ...message,
                    id: event.data.messageId,
                    speakableText: event.data.speakableText,
                  }
                : message,
            ),
          );
        if (event.type === 'error') throw new Error(event.data.message);
        if (event.type === 'health_card_updated') {
          setHealthDate(event.data.recordDate);
          setHealthNotice({
            id: createClientId(),
            recordDate: event.data.recordDate,
            text: healthUpdateText(event.data.recordDate, event.data.items),
          });
        }
        if (event.type === 'health_card_update_failed')
          toast.add({
            title: '健康卡片自动更新失败',
            description: event.data.message,
            type: 'error',
          });
        if (event.type === 'health_card_preview' && event.data.items?.length) {
          try {
            await services.healthCard.confirm(
              event.data.draftId,
              event.data.items,
              createClientId(),
            );
            setHealthDate(event.data.recordDate);
            setHealthNotice({
              id: createClientId(),
              recordDate: event.data.recordDate,
              text: healthUpdateText(event.data.recordDate, event.data.items),
            });
          } catch {
            toast.add({
              title: '健康卡片自动更新失败',
              description: '可点击右上角健康卡片图标手动补充',
              type: 'error',
            });
          }
        }
      }
    } catch {
      if (!controller.signal.aborted)
        setMessages((m) =>
          m.map((message, index) =>
            index === m.length - 1 && message.from === 'ai'
              ? { ...message, text: '这次没有连接上，请稍后重试。' }
              : message,
          ),
        );
    } finally {
      setChatGenerating(false);
      chatAbortRef.current = null;
    }
  };

  const content = (() => {
    if (view === 'home') return <HomeView go={go} />;
    if (view === 'community') return <Community soon={soon} />;
    if (view === 'messages') return <Messages go={go} soon={soon} />;
    if (view === 'profile') return <Profile go={go} soon={soon} />;
    if (view === 'chat')
      return (
        <Chat
          messages={messages}
          text={chatText}
          setText={setChatText}
          send={sendChat}
          generating={chatGenerating}
          stop={() => chatAbortRef.current?.abort()}
          back={back}
          healthNotice={healthNotice}
          dismissHealthNotice={() => setHealthNotice(null)}
          onNavigate={(target, params) => {
            if (target === 'healthCard') setHealthDate(params?.date);
            if (target === 'profile') setProfilePrefill(params ?? null);
            go(navigationView(target));
          }}
          onEditHealth={() => go('health')}
        />
      );
    if (view === 'health')
      return (
        <>
          <PageHeader
            title="健康卡片"
            subtitle="可查看和修改任意日期的记录"
            onBack={back}
          />
          <HealthRecordEditor initialDate={healthDate} onBack={back} />
        </>
      );
    if (view === 'actions') return <Actions back={back} soon={soon} />;
    if (view === 'month')
      return (
        <Month
          back={back}
          go={go}
          dimension={dimension}
          setDimension={setDimension}
          chart={chart}
          setChart={setChart}
          onEditHealth={() => go('health')}
        />
      );
    if (view === 'summaries') return <Summaries back={back} go={go} />;
    if (view === 'summary') return <Summary back={back} soon={soon} />;
    if (view === 'range')
      return <Range back={back} range={range} setRange={setRange} onPreview={async (coverage) => {
        try { const preview = await services.reports.preview(range); if (preview.range.startDate !== coverage.startDate || preview.range.endDate !== coverage.endDate) throw new Error('REPORT_RANGE_MISMATCH'); setReportPreview(preview); setReportCoverage(coverage); setReportDraft(null); go('report'); }
        catch { toast.add({ title: '暂时无法生成报告预览', description: '请稍后重试。', type: 'error' }); }
      }} />;
    if (view === 'report')
      return (
        <Report
          back={back}
          profile={profile}
          range={range}
          preview={reportPreview}
          coverage={reportCoverage}
          draft={reportDraft}
          onDraftSaved={setReportDraft}
        />
      );
    if (view === 'expression')
      return (
        <Expression
          back={back}
          input={expression}
          setInput={setExpression}
          polished={polished}
          setPolished={setPolished}
        />
      );
    if (view === 'achievements') return <Achievements back={back} />;
    return (
      <Personal
        back={() => {
          setProfilePrefill(null);
          back();
        }}
        profile={profile}
        prefill={profilePrefill}
        setProfile={setProfile}
      />
    );
  })();

  const detailScreens: View[] = [
    'actions',
    'month',
    'summaries',
    'summary',
    'range',
    'report',
    'achievements',
  ];
  const contentClassName =
    view === 'chat'
      ? 'chat-screen'
      : view === 'health'
        ? 'health-screen'
        : view === 'expression'
          ? 'expression-screen'
          : view === 'personal'
            ? 'personal-screen'
            : detailScreens.includes(view)
              ? 'secondary-screen'
              : undefined;
  return (
    <main className="prototype-stage">
      <Screen
        navActive={
          ['home', 'community', 'messages', 'profile'].includes(view)
            ? activeNav
            : undefined
        }
        onGo={root}
        contentClassName={contentClassName}
      >
        {content}
      </Screen>
      <Toaster />
    </main>
  );
}

function HomeView({ go }: { go: (v: View) => void }) {
  const demoActions = [
    {
      name: '散步',
      duration: '20 分钟',
      description: '舒缓心情，促进代谢',
      Icon: PersonStanding,
    },
    {
      name: '睡前舒展',
      duration: '8 分钟',
      description: '放松身体，改善睡眠',
      Icon: Moon,
    },
  ] as const;
  const [monthlyStats, setMonthlyStats] = useState<MonthlyHealthStats | null>(
    null,
  );
  const month = shanghaiMonth();
  useEffect(() => {
    let active = true;
    services.healthRecords
      .monthly(month)
      .then((value) => {
        if (active) setMonthlyStats(value);
      })
      .catch(() => {
        if (active) setMonthlyStats(null);
      });
    return () => {
      active = false;
    };
  }, [month]);
  const overview = homeMonthlyOverview(monthlyStats);
  return (
    <>
      <div className="home-heading">
        <h1>
          早上好，
          <br />
          今天感觉怎么样？
        </h1>
        <button className="icon-button" onClick={() => go('month')}>
          <CalendarDays />
        </button>
      </div>
      <button
        type="button"
        className="hero-card chat-bg"
        onClick={() => go('chat')}
      >
        <div>
          <h2>絮絮叨叨</h2>
          <p>想说什么都可以，我在听</p>
        </div>
        <span className="dark-pill">
          开始聊聊 <ArrowRight />
        </span>
      </button>
      <section className="motion-card">
        <div className="motion-copy">
          <h2>今天动一动</h2>
          <p>
            小步动起来，
            <br />
            更年期，更年轻
          </p>
        </div>
        <button
          type="button"
          className="round-arrow"
          onClick={() => go('actions')}
          aria-label="查看全部活动"
        >
          <ChevronRight />
        </button>
        <div className="motion-recommend-list">
          {demoActions.map(({ name, duration, description, Icon }) => (
            <button type="button" key={name} onClick={() => go('actions')}>
              <Icon />
              <span>
                <b>
                  {name} <small>{duration}</small>
                </b>
                <em>{description}</em>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </section>
      <section className="month-card">
        <h2>这个月的我</h2>
        <div className="metric-grid">
          <button type="button" onClick={() => go('month')}>
            <Moon />
            <b>睡眠</b>
            <strong>{overview.sleep.value}</strong>
            <span>{overview.sleep.status}</span>
          </button>
          <button type="button" onClick={() => go('month')}>
            <Smile />
            <b>心情</b>
            <strong>{overview.mood.value}</strong>
            <span>{overview.mood.status}</span>
          </button>
          <button type="button" onClick={() => go('month')}>
            <Sprout />
            <b>运动</b>
            <strong>{overview.exercise.value}</strong>
            <span>{overview.exercise.status}</span>
          </button>
        </div>
        <div
          className="month-record-strip"
          aria-label={`本月已记录 ${overview.recordedDays} 天`}
        >
          {overview.days.length ? (
            overview.days.map((day) => (
              <i className={day.hasRecord ? 'active' : ''} key={day.date} />
            ))
          ) : (
            <i />
          )}
        </div>
        <div className="month-coverage">
          本月已记录 {overview.recordedDays} 天
        </div>
      </section>
    </>
  );
}

function Community({ soon }: { soon: () => void }) {
  return (
    <>
      <div className="top-title">
        <h1>交流广场</h1>
        <button className="icon-button" onClick={soon}>
          <ShoppingBag />
        </button>
      </div>
      <button className="searchbar" onClick={soon}>
        <Search />
        搜索帖子或话题
      </button>
      <div className="feed">
        {posts.map((p) => (
          <article
            className={`post ${p.image ? 'has-image' : ''}`}
            key={p.name}
          >
            <div className="post-user">
              <span>{p.emoji}</span>
              <div>
                <b>{p.name}</b>
                <small>{p.time}</small>
              </div>
            </div>
            <div className="post-body">
              <p>{p.text}</p>
              {p.image && (
                <button className="post-image" onClick={soon}>
                  {p.image}
                </button>
              )}
            </div>
            <div className="post-actions">
              <button onClick={soon}>
                <Heart />
                {p.likes}
              </button>
              <button onClick={soon}>
                <MessageCircle />
                {p.comments}
              </button>
              <button onClick={soon}>
                <Star />
                收藏
              </button>
            </div>
          </article>
        ))}
      </div>
      <button className="fab" onClick={soon}>
        <Plus />
      </button>
    </>
  );
}

function Messages({ go, soon }: { go: (v: View) => void; soon: () => void }) {
  return (
    <>
      <div className="top-title">
        <h1>我的消息</h1>
        <button className="icon-button" onClick={soon} aria-label="添加好友">
          <UserPlus />
        </button>
      </div>
      <section className="expression-card ai-bg">
        <div className="expression-card-copy">
          <small>沟通表达助手</small>
          <h2>AI 帮我说</h2>
          <p>你想说的话，我帮你温柔地说出来。</p>
        </div>
        <ul className="expression-benefits" aria-label="功能说明">
          <li>保留你的真实意思</li>
          <li>支持文字或语音</li>
        </ul>
        <button className="dark-pill" onClick={() => go('expression')}>
          试着说说 <ArrowRight />
        </button>
      </section>
      <div className="notice-grid">
        <button onClick={soon}>
          <span className="notice-icon blue">
            <MessageCircle />
          </span>
          <span>
            <b>评论和@</b>
            <small>3 条新通知</small>
          </span>
          <i>3</i>
          <ChevronRight />
        </button>
        <button onClick={soon}>
          <span className="notice-icon rose">
            <Heart />
          </span>
          <span>
            <b>点赞和收藏</b>
            <small>7 条新通知</small>
          </span>
          <i>7</i>
          <ChevronRight />
        </button>
      </div>
      <div className="message-list">
        {[
          [
            '知心姐姐',
            '回复了你的帖子：我也有同样的感受，一起加油呀～',
            '10:24',
          ],
          ['岁月静好', '赞了你的帖子', '昨天'],
          ['自在如风', '在你的帖子下评论了', '昨天'],
        ].map((x) => (
          <button key={x[0]} onClick={soon}>
            <span className="avatar">{x[0][0]}</span>
            <span>
              <b>{x[0]}</b>
              <small>{x[1]}</small>
            </span>
            <em>{x[2]}</em>
            <ChevronRight />
          </button>
        ))}
      </div>
    </>
  );
}

function Profile({ go, soon }: { go: (v: View) => void; soon: () => void }) {
  const achievements = useAchievements();
  const latest = achievements
    .filter((achievement) => achievement.achievedAt)
    .sort((a, b) => String(b.achievedAt).localeCompare(String(a.achievedAt)))
    .slice(0, 3);
  const previewItems: Array<Achievement | null> = [
    ...latest,
    ...Array.from({ length: Math.max(0, 3 - latest.length) }, () => null),
  ];
  return (
    <>
      <div className="profile-head">
        <span className="portrait">林</span>
        <div>
          <h1>林杉</h1>
          <p>拥抱变化，温柔而有力量</p>
        </div>
        <button className="icon-button" onClick={() => go('personal')}>
          <Pencil />
        </button>
      </div>
      <button
        className="achievement-preview"
        onClick={() => go('achievements')}
      >
        <div>
          <h2>我的成就</h2>
          <p>{latest.length ? `已点亮 ${achievements.filter((item) => item.achievedAt).length} 枚成就` : '从第一天健康记录开始'}</p>
        </div>
        <div className="achievement-preview-badges" aria-label={latest.length ? '最新达成的成就' : '暂未达成成就'}>
          {previewItems.map((achievement, index) => achievement ? (
            <span className={`achievement-preview-badge earned badge-${achievement.group}`} key={achievement.id} title={achievement.name}>
              <AchievementIcon group={achievement.group} />
            </span>
          ) : <span className="achievement-preview-badge empty" key={`empty-${index}`} aria-hidden="true" />)}
        </div>
      </button>
      <div className="menu-stack">
        <button onClick={soon}>
          <Star />
          <span>
            <b>我的收藏</b>
            <small>广场内容与商城商品</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => go('personal')}>
          <CircleUserRound />
          <span>
            <b>我的资料</b>
            <small>检查报告与用药记录</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={soon}>
          <Settings />
          <span>
            <b>设置与隐私</b>
            <small>账号、通知与数据</small>
          </span>
          <ChevronRight />
        </button>
      </div>
    </>
  );
}

function Chat({
  messages,
  text,
  setText,
  send,
  generating,
  stop,
  back,
  onEditHealth,
  onNavigate,
  healthNotice,
  dismissHealthNotice,
}: {
  messages: ChatMessage[];
  text: string;
  setText: (v: string) => void;
  send: (text?: string) => void;
  generating: boolean;
  stop: () => void;
  back: () => void;
  onEditHealth: () => void;
  onNavigate: (
    target: NavigationTarget,
    params?: Record<string, string>,
  ) => void;
  healthNotice: HealthUpdateNotice | null;
  dismissHealthNotice: () => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  useEffect(() => {
    const flow = flowRef.current;
    if (flow) flow.scrollTop = flow.scrollHeight;
  }, [messages]);
  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      toast.add({ title: '当前浏览器不支持录音', type: 'error' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setSpeechBusy(true);
        try {
          const transcript = await services.speech.transcribe(
            audio,
            Date.now() - startedRef.current,
            createClientId(),
          );
          if (transcript) {
            setText(transcript);
            send(transcript);
          }
        } catch {
          toast.add({ title: '语音识别失败，请重试', type: 'error' });
        } finally {
          setSpeechBusy(false);
        }
      };
      recorder.start();
      setRecording(true);
      toast.add({
        title: '正在聆听…',
        description: '再次点击麦克风结束并发送',
      });
    } catch {
      toast.add({
        title: '无法使用麦克风',
        description: '请允许浏览器访问麦克风',
        type: 'error',
      });
    }
  };
  const play = async (message: ChatMessage) => {
    if (!message.text) return;
    try {
      if (message.id && message.speakableText) {
        const blob = await services.speech.synthesize(
          message.id,
          message.speakableText,
        );
        if (blob) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();
          return;
        }
      }
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(message.text));
      }
    } catch {
      toast.add({ title: '暂时无法朗读', type: 'error' });
    }
  };
  const healthCardAction = (
    <div className="health-edit-anchor">
      <button
        className="icon-button"
        onClick={() => {
          dismissHealthNotice();
          onEditHealth();
        }}
        aria-label="编辑健康卡片"
      >
        <Pencil />
      </button>
      {healthNotice && (
        <output className="health-update-popover">{healthNotice.text}</output>
      )}
    </div>
  );
  return (
    <div className="full-view chat-view">
      <PageHeader title="絮絮叨叨" onBack={back} action={healthCardAction} />
      <div className="disclaimer">
        我会陪你整理感受与记录，但不能替代医生诊断；如有急症请及时就医
      </div>
      <div
        ref={flowRef}
        className="chat-flow"
        aria-live="polite"
        aria-busy={generating}
      >
        {messages.map((m, i) => (
          <div className={`chat-message ${m.from}`} key={i}>
            <div className={`bubble ${m.from}`}>
              {m.from === 'ai' && m.text ? (
                <MarkdownMessage text={m.text} />
              ) : (
                <span className="plain-message">{m.text || '正在听你说…'}</span>
              )}
              {m.from === 'ai' && m.text && (
                <button
                  type="button"
                  className="speak-message"
                  aria-label="播放语音"
                  onClick={() => void play(m)}
                >
                  <Volume2 />
                </button>
              )}
            </div>
            {m.navigation && (
              <FeatureCard intent={m.navigation} onOpen={onNavigate} />
            )}{' '}
            {m.sources?.length ? (
              <details className="chat-sources">
                <summary>参考资料 {m.sources.length} 条</summary>
                {m.sources.map((source, index) => (
                  <p key={`${source.title}-${index}`}>
                    {source.sourceUrl ? (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                  </p>
                ))}
              </details>
            ) : null}
          </div>
        ))}
      </div>
      <div className="chat-composer">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          onKeyDown={(e) =>
            e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())
          }
          placeholder="说点什么..."
          aria-label="对话内容"
        />
        <button
          type="button"
          className={`mic ${recording ? 'recording' : ''}`}
          onClick={() => void toggleRecording()}
          disabled={speechBusy || generating}
          aria-label={recording ? '结束录音并发送' : '开始语音输入'}
        >
          {recording ? <X /> : <Mic />}
        </button>
        {generating ? (
          <button
            type="button"
            className="send"
            onClick={stop}
            aria-label="停止生成"
          >
            <X />
          </button>
        ) : (
          <button
            type="button"
            className="send"
            onClick={() => send()}
            disabled={!text.trim() || speechBusy}
            aria-label="发送"
          >
            <Send />
          </button>
        )}
      </div>
    </div>
  );
}

function readableMarkdown(text: string) {
  const withLists = text
    .replace(/([。！？!?；;])\s*(?=\d+[.)、]\s*)/g, '$1\n\n')
    .replace(/\s+(?=(?:[-*+]|\d+[.)、])\s+)/g, '\n');
  if (
    withLists.includes('\n') ||
    /(^|\s)(#{1,6}\s|```|>\s)|\*\*[^*]+\*\*/.test(withLists) ||
    withLists.length < 80
  )
    return withLists;
  const sentences =
    withLists
      .match(/[^。！？!?；;]+[。！？!?；;]?/g)
      ?.map((value) => value.trim())
      .filter(Boolean) ?? [];
  if (sentences.length < 3) return withLists;
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2)
    paragraphs.push(sentences.slice(index, index + 2).join(''));
  return paragraphs.join('\n\n');
}
function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href, title }) => (
            <a href={href} title={title} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {readableMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}

const FEATURE_COPY: Record<
  NavigationTarget,
  { title: string; description: string }
> = {
  reportExport: {
    title: '生成就医报告',
    description: '汇总已确认记录，预览后再导出',
  },
  monthlySummary: {
    title: '查看月度总结',
    description: '回顾身体、睡眠、心情和运动',
  },
  monthlyRecords: {
    title: '打开月历与曲线',
    description: '查看这个月的记录变化',
  },
  exerciseToday: {
    title: '查看今日建议',
    description: '根据近期记录安排温和行动',
  },
  exerciseCategories: {
    title: '浏览全部行动',
    description: '按类别选择适合自己的活动',
  },
  healthCard: {
    title: '编辑健康卡片',
    description: '查看、补充或删除任意日期记录',
  },
  profile: { title: '填写个人资料', description: '补充报告需要的基础信息' },
};
function FeatureCard({
  intent,
  onOpen,
}: {
  intent: { target: NavigationTarget; params?: Record<string, string> };
  onOpen: (target: NavigationTarget, params?: Record<string, string>) => void;
}) {
  const copy = FEATURE_COPY[intent.target];
  return (
    <button
      type="button"
      className="ai-feature-card"
      onClick={() => onOpen(intent.target, intent.params)}
    >
      <span>
        <b>{copy.title}</b>
        <small>{copy.description}</small>
      </span>
      <ArrowRight />
    </button>
  );
}
function navigationView(target: NavigationTarget): View {
  if (target === 'reportExport') return 'range';
  if (target === 'monthlySummary') return 'summaries';
  if (target === 'monthlyRecords') return 'month';
  if (target === 'healthCard') return 'health';
  if (target === 'profile') return 'personal';
  return 'actions';
}

function Actions({ back, soon }: { back: () => void; soon: () => void }) {
  const [items, setItems] = useState<
    Array<{ id: string; category: string; title: string; description: string }>
  >([]);
  useEffect(() => {
    let active = true;
    services.recommendations
      .getToday()
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => toast.add({ title: '建议读取失败', type: 'error' }));
    return () => {
      active = false;
    };
  }, []);
  return (
    <DetailWorkspace
      header={
        <PageHeader
          title="今天动一动"
          subtitle="从你愿意的地方开始"
          onBack={back}
        />
      }
    >
      <div className="action-hero menopause-bg">
        <div>
          {items.slice(0, 2).map((item) => (
            <b key={item.id}>
              {item.title} <small>{item.category}</small>
            </b>
          ))}
        </div>
        <p>
          {items.length
            ? '根据你最近确认的记录为你整理'
            : '正在整理适合你的建议…'}
        </p>
      </div>
      <h2 className="section-title">查看全部</h2>
      <div className="category-list">
        {categories.map(([name, desc, Icon]) => (
          <button key={name} onClick={soon}>
            <Icon />
            <span>
              <b>{name}</b>
              <small>{desc}</small>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>
      <p className="footnote">建议仅作日常参考，身体不适时请暂停并及时就医</p>
    </DetailWorkspace>
  );
}

function Month({
  back,
  go,
  dimension,
  setDimension,
  chart,
  setChart,
  onEditHealth,
}: {
  back: () => void;
  go: (v: View) => void;
  dimension: string;
  setDimension: (v: string) => void;
  chart: boolean;
  setChart: (v: boolean) => void;
  onEditHealth: () => void;
}) {
  const dims = ['我的睡眠', '我的潮热', '我的心情', '我的运动'];
  const [month, setMonth] = useState(() =>
    new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      .slice(0, 7),
  );
  const [stats, setStats] = useState<MonthlyHealthStats | null>(null);
  useEffect(() => {
    let active = true;
    services.healthRecords
      .monthly(month)
      .then((value) => {
        if (active) setStats(value);
      })
      .catch(() => {
        if (active) {
          setStats(null);
          toast.add({ title: '月度记录读取失败', type: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [month]);
  const move = (offset: number) => {
    const [year, value] = month.split('-').map(Number);
    setMonth(
      new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7),
    );
  };
  const days = stats?.days ?? [];
  const recorded = days.filter((day) => day.hasRecord).length;
  const settled = days.filter((day) =>
    ['舒展', '平静'].includes(String(day.mood?.state ?? '')),
  ).length;
  const flashes = days.reduce(
    (sum, day) => sum + (Number(day.hotFlash?.frequencyCount) || 0),
    0,
  );
  const exercise = days.filter((day) => day.exercise).length;
  const digest = recorded
    ? `本月已记录 ${recorded} 天。多记录一点，多了解自己一点。`
    : '这个月还没有记录';
  return (
    <DetailWorkspace header={<PageHeader
        title="这个月的我"
        onBack={back}
        action={
          <>
            <button
              className="icon-button"
              onClick={onEditHealth}
              aria-label="编辑健康卡片"
            >
              <Pencil />
            </button>
            <button className="view-toggle" onClick={() => setChart(!chart)}>
              {chart ? <Waves /> : <CalendarDays />}
              <span>{chart ? '柱状图' : '日历'}</span>
              <small>⌄</small>
            </button>
          </>
        }
      />}>
      <div className="month-switch">
        <button onClick={() => move(-1)}>‹</button>
        <b>{month.replace('-', '年')}月</b>
        <button
          onClick={() => move(1)}
          disabled={month >= new Date().toISOString().slice(0, 7)}
        >
          ›
        </button>
      </div>
      <div className="segmented">
        {dims.map((d) => (
          <button
            key={d}
            className={dimension === d ? 'active' : ''}
            onClick={() => setDimension(d)}
          >
            {d}
          </button>
        ))}
      </div>
      {chart ? (
        <Trend dimension={dimension} days={days} />
      ) : (
        <Calendar dimension={dimension} month={month} days={days} />
      )}
      <section className="month-summary monthly-bg">
        <h3>{digest}</h3>
        <div>
          <span>
            <small>已记录</small>
            <b>{recorded}天</b>
          </span>
          <span>
            <small>舒展/平静</small>
            <b>{settled}天</b>
          </span>
          <span>
            <small>潮热</small>
            <b>{flashes}次</b>
          </span>
          <span>
            <small>运动</small>
            <b>{exercise}天</b>
          </span>
        </div>
      </section>
      <div className="month-links">
        <button onClick={() => go('summaries')}>
          <FileText />
          月度总结
        </button>
        <button onClick={() => go('range')}>
          <ClipboardPlus />
          就医报告
        </button>
      </div>
    </DetailWorkspace>
  );
}
type MonthDay = MonthlyHealthStats['days'][number];
type MonthPoint = {
  value: number | null;
  marker: string;
  label: string;
  estimated?: boolean;
};
const sleepEstimate = (quality: unknown) =>
  quality === '好' ? 450 : quality === '差' ? 330 : 390;
const durationLabel = (minutes: number) =>
  `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
function exerciseMinutes(value: unknown) {
  const text = String(value ?? '').replace(/\s/g, '');
  const hours = [...text.matchAll(/(\d+(?:\.\d+)?)小时/g)].reduce(
    (sum, item) => sum + Number(item[1]) * 60,
    0,
  );
  const minutes = [...text.matchAll(/(\d+(?:\.\d+)?)(?:分钟|分|min)/gi)].reduce(
    (sum, item) => sum + Number(item[1]),
    0,
  );
  return hours + minutes || null;
}
function monthPoint(day: MonthDay, dimension: string): MonthPoint {
  if (dimension === '我的睡眠') {
    const sleep = day.sleep;
    if (!sleep) return { value: null, marker: '', label: '暂无睡眠记录' };
    const actual = Number(sleep.durationMinutes);
    const estimated = !Number.isFinite(actual) || actual <= 0;
    const value = estimated ? sleepEstimate(sleep.quality) : actual;
    const marker =
      sleep.quality === '好'
        ? 'sleep-good'
        : sleep.quality === '差'
          ? 'sleep-poor'
          : 'sleep-average';
    return {
      value,
      marker,
      label: `睡眠 ${durationLabel(value)}${estimated ? '（估算，缺乏具体数据）' : ''}`,
      estimated,
    };
  }
  if (dimension === '我的潮热') {
    if (!day.hotFlash)
      return { value: null, marker: '', label: '暂无潮热记录' };
    const raw = Number(day.hotFlash.chartValue);
    const value = Number.isFinite(raw) ? raw : 0;
    return {
      value,
      marker: value >= 3 ? 'heavy' : value >= 2 ? 'medium' : 'light',
      label: `潮热 ${value} 次`,
    };
  }
  if (dimension === '我的心情') {
    const state = String(day.mood?.state ?? '');
    if (!state) return { value: 0, marker: '', label: '暂无心情记录' };
    const values: Record<string, number> = {
      低落: 1,
      焦虑: 2,
      烦躁: 3,
      复杂: 4,
      平静: 5,
      舒展: 6,
    };
    const markers: Record<string, string> = {
      舒展: 'mood-relaxed',
      平静: 'mood-calm',
      低落: 'mood-low',
      焦虑: 'mood-anxious',
      烦躁: 'mood-irritable',
      复杂: 'mood-complex',
    };
    return {
      value: values[state] ?? 0,
      marker: markers[state] ?? 'mood-complex',
      label: `心情：${state}${day.mood?.intensity ? `（${String(day.mood.intensity)}）` : ''}`,
    };
  }
  if (dimension === '我的运动') {
    if (!day.exercise) return { value: 0, marker: '', label: '无运动记录' };
    const actual = exerciseMinutes(day.exercise.duration);
    const estimated = actual === null;
    const value = actual ?? 30;
    return {
      value,
      marker: 'exercise',
      label: `运动 ${durationLabel(value)}${estimated ? '（估算，缺乏具体数据）' : ''}`,
      estimated,
    };
  }
  return { value: null, marker: '', label: '暂无记录' };
}
function monthLegend(dimension: string) {
  if (dimension === '我的睡眠')
    return (
      <>
        <i className="sleep-good" />
        好　
        <i className="sleep-average" />
        一般　
        <i className="sleep-poor" />差
      </>
    );
  if (dimension === '我的心情')
    return (
      <>
        <i className="mood-relaxed" />
        舒展　
        <i className="mood-calm" />
        平静　
        <i className="mood-low" />
        低落　
        <i className="mood-anxious" />
        焦虑　
        <i className="mood-irritable" />
        烦躁　
        <i className="mood-complex" />
        说不清
      </>
    );
  if (dimension === '我的运动')
    return (
      <>
        <i className="exercise" />
        今天有运动
      </>
    );
  return (
    <>
      <i className="light" />
      轻　
      <i className="medium" />
      中　
      <i className="heavy" />重
    </>
  );
}
function Calendar({
  dimension,
  month,
  days,
}: {
  dimension: string;
  month: string;
  days: MonthlyHealthStats['days'];
}) {
  const [year, value] = month.split('-').map(Number);
  const offset = (new Date(year, value - 1, 1).getDay() + 6) % 7;
  return (
    <div className="calendar">
      <div className="week">
        {['一', '二', '三', '四', '五', '六', '日'].map((x) => (
          <b key={x}>{x}</b>
        ))}
      </div>
      <div className="days">
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map((day) => {
          const point = monthPoint(day, dimension);
          return (
            <button
              key={day.date}
              title={
                point.value === null
                  ? day.hasRecord
                    ? '该维度暂无记录'
                    : '暂无记录'
                  : point.label
              }
            >
              <span>{Number(day.date.slice(-2))}</span>
              {point.marker && <i className={point.marker} />}
            </button>
          );
        })}
      </div>
      <div className="legend">
        当前查看：{dimension}　{monthLegend(dimension)}
      </div>
    </div>
  );
}
function Trend({
  dimension,
  days,
}: {
  dimension: string;
  days: MonthlyHealthStats['days'];
}) {
  const values = days.map((day) => monthPoint(day, dimension));
  const numeric = values.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const max =
    dimension === '我的睡眠'
      ? 600
      : dimension === '我的运动'
        ? Math.max(60, Math.ceil(Math.max(...numeric, 0) / 30) * 30)
        : dimension === '我的心情'
          ? 6
          : Math.max(3, ...numeric);
  const min = 0;
  const range = max - min || 1;
  const x = (index: number) => 14 + index * (292 / Math.max(values.length, 1));
  const width = Math.max(4, 230 / Math.max(values.length, 1));
  // Keep the shared 0 baseline close to the bottom axis across every bar chart.
  const y = (value: number) =>
    12 + ((max - Math.min(max, Math.max(min, value))) / range) * 128;
  const zeroY = y(0);
  const axis =
    dimension === '我的睡眠'
      ? ['10小时', '5小时', '0小时']
      : dimension === '我的运动'
        ? [durationLabel(max), durationLabel(Math.round(max / 2)), '0分']
        : ['高', '中', '0'];
  const moodAxisTop = (value: number) =>
    `${Math.round((y(value) / 150) * 170 - 5)}px`;
  return (
    <div className="trend-panel">
      <div className="trend-graph">
        <div
          className={`trend-y-labels${dimension === '我的心情' ? ' mood-axis' : ''}`}
        >
          {dimension === '我的心情' ? (
            <>
              <span style={{ top: moodAxisTop(6) }}>舒展 6</span>
              <span style={{ top: moodAxisTop(4) }}>复杂 4</span>
              <span style={{ top: moodAxisTop(1) }}>低落 1</span>
            </>
          ) : (
            axis.map((label, index) => <span key={index}>{label}</span>)
          )}
        </div>
        <svg viewBox="0 0 320 150" aria-label={`${dimension}月度柱状图`}>
          <line
            className="bar-zero-line"
            x1="8"
            x2="314"
            y1={zeroY}
            y2={zeroY}
          />
          {values.map((point, index) => {
            if (point.value === null || point.value === 0) return null;
            const valueY = y(point.value);
            const top = Math.min(valueY, zeroY);
            return (
              <rect
                className={`bar-fill ${point.marker}`}
                key={index}
                x={x(index)}
                y={top}
                width={width}
                height={Math.max(2, Math.abs(zeroY - valueY))}
                rx="2"
              >
                <title>{point.label}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="trend-labels">
        <span>1日</span>
        <span>8日</span>
        <span>15日</span>
        <span>22日</span>
        <span>月底</span>
      </div>
      <p>
        {numeric.some(Boolean)
          ? '虚线为 0 基准；标注“缺乏具体数据”的柱为估算值'
          : '本月暂无可绘制数据'}
      </p>
    </div>
  );
}

function Summaries({ back, go }: { back: () => void; go: (v: View) => void }) {
  return (
    <DetailWorkspace
      header={
        <PageHeader
          title="月度总结"
          subtitle="回看每一段真实的变化"
          onBack={back}
        />
      }
    >
      <h3 className="year">2026年</h3>
      <div className="summary-list">
        {[
          ['8月', '睡眠更稳定，潮热记录趋于平缓'],
          ['7月', '作息更规律，心情整体更平稳'],
          ['6月', '潮热次数减少，夜间睡眠改善'],
          ['5月', '记录逐渐稳定，开始建立节奏'],
        ].map((x, i) => (
          <button
            key={x[0]}
            className={i === 0 ? 'new' : ''}
            onClick={() => go('summary')}
          >
            <b>
              {x[0]}
              {i === 0 && <i>新总结</i>}
            </b>
            <p>{x[1]}</p>
            <ChevronRight />
          </button>
        ))}
      </div>
      <p className="footnote">总结来自你确认保存的记录</p>
    </DetailWorkspace>
  );
}
function Sparkline({ tone }: { tone: string }) {
  return (
    <svg className="sparkline" viewBox="0 0 130 34" aria-hidden="true">
      <path d="M2 25 C18 27 25 7 42 12 S63 29 78 18 S103 5 128 11" />
      <circle cx="128" cy="11" r="4" fill={tone} />
    </svg>
  );
}
function Summary({ back, soon }: { back: () => void; soon: () => void }) {
  const insights = [
    ['睡眠', '平均睡眠7.2小时，夜间醒来次数减少。', '#99aa8e'],
    ['潮热', '潮热频次较上月下降约19%。', '#d49b9c'],
    ['心情', '情绪总体平稳，积极情绪占比提升。', '#dfb77e'],
    ['运动', '运动更有规律，累计运动7天。', '#98b4bf'],
  ];
  return (
    <DetailWorkspace
      header={
        <PageHeader
          title="2026年 8月总结"
          onBack={back}
          action={
            <button className="icon-button" onClick={soon}>
              <Share2 />
            </button>
          }
        />
      }
    >
      <section className="overview">
        <h3>月度概览</h3>
        <div className="petal-chart">
          {[
            ['记录', '18天'],
            ['睡眠', '7.2h'],
            ['潮热', '21次'],
            ['运动', '7天'],
          ].map((x, i) => (
            <span className={`petal p${i + 1}`} key={x[0]}>
              <small>{x[0]}</small>
              <b>{x[1]}</b>
            </span>
          ))}
          <i className="petal-center" />
        </div>
      </section>
      <div className="insight-grid">
        {insights.map((x) => (
          <section key={x[0]}>
            <b>{x[0]}</b>
            <p>{x[1]}</p>
            <Sparkline tone={x[2]} />
          </section>
        ))}
      </div>
      <section className="good-things monthly-bg">
        <h3>这个月发生的好事情</h3>
        <p>开始坚持晚饭后散步，也主动约了老朋友见面。</p>
      </section>
      <Button className="primary-wide" onClick={soon}>
        <Share2 /> 系统分享
      </Button>
    </DetailWorkspace>
  );
}

function Range({
  back,
  range,
  setRange,
  onPreview,
}: {
  back: () => void;
  range: ReportRange;
  setRange: (v: ReportRange) => void;
  onPreview: (coverage: ReportCoverage) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<ReportCoverage | null>(null);
  const [coverageError, setCoverageError] = useState(false);
  useEffect(() => {
    let active = true;
    setCoverage(null);
    setCoverageError(false);
    services.reports.coverage(range)
      .then((result) => { if (active) setCoverage(result); })
      .catch(() => { if (active) setCoverageError(true); });
    return () => { active = false; };
  }, [range]);
  return (
    <DetailWorkspace
      header={
        <PageHeader
          title="生成就医报告"
          subtitle="选择希望汇总的时间范围"
          onBack={back}
        />
      }
      footer={
        <Button
          className="primary-wide range-preview-action"
          disabled={loading}
          onClick={async () => { setLoading(true); try { const current = await services.reports.coverage(range); setCoverage(current); setCoverageError(false); await onPreview(current); } catch { setCoverageError(true); toast.add({ title: '无法读取报告范围，请重试', type: 'error' }); } finally { setLoading(false); } }}
        >
          预览报告
        </Button>
      }
    >
      <div className="range-list">
        {[
          ['1个月', '2026年8月'],
          ['3个月', '2026年6月–8月'],
          ['半年', '2026年3月–8月'],
        ].map((x) => (
          <button
            className={range === (x[0] === '1个月' ? '1_month' : x[0] === '3个月' ? '3_months' : '6_months') ? 'active' : ''}
            key={x[0]}
            onClick={() => setRange(x[0] === '1个月' ? '1_month' : x[0] === '3个月' ? '3_months' : '6_months')}
          >
            <span>
              <b>{x[0]}</b>
            </span>
            <i>{range === (x[0] === '1个月' ? '1_month' : x[0] === '3个月' ? '3_months' : '6_months') && <Check />}</i>
          </button>
        ))}
      </div>
      <section className="coverage">
        <small>数据覆盖情况</small>
        <p>{coverageError ? '暂时无法读取覆盖情况，请重试' : coverage === null ? '正在读取已确认记录…' : `已记录 ${coverage.recordedDays} 天 · 范围共 ${coverage.totalDays} 天`}</p>
        <small>{coverage ? `统计范围：${coverage.startDate}–${coverage.endDate} · 记录覆盖率 ${coverage.coveragePercent}%` : '统计范围内已确认保存的健康卡片。'}</small>
      </section>
      <div className="info-callout">
        即使没有足够记录，也可以继续生成空模板并手动填写。
      </div>
      <p className="privacy">
        <LockKeyhole />
        报告只使用你确认保存的数据
      </p>
    </DetailWorkspace>
  );
}

function Report({
  back, profile, range, preview, coverage, draft, onDraftSaved,
}: {
  back: () => void;
  profile: ProfileData;
  range: ReportRange;
  preview: ReportPreview | null;
  coverage: ReportCoverage | null;
  draft: ReportDraft | null;
  onDraftSaved: (draft: ReportDraft) => void;
}) {
  const [local] = useState(profile);
  const [saving, setSaving] = useState(false);
  const source = draft?.snapshot ?? preview;
  const [overrides, setOverrides] = useState<Record<string, string>>(draft?.overrides ?? {});
  const p = source?.profile;
  const fields: Array<[string, string, string, 'short' | 'long' | 'select']> = [
    ['birth', '出生年份', p ? String(p.birthYear ?? '') : local.birth, 'short'],
    ['height', '身高（cm）', p ? String(p.height ?? '') : local.height, 'short'],
    ['menopausalStatus', '绝经状态', p ? p.menopausalStatus ?? '' : local.menopausalStatus, 'select'],
    ['regularMedications', '长期/规律用药', p ? p.regularMedications ?? p.medications.map(item => `${item.name}（${item.status}）`).join('；') : local.regularMedications, 'long'],
    ['medicalHistory', '既往病史', p ? p.medicalHistory : local.history, 'long'],
    ['surgeryHistory', '手术史', p ? p.surgeryHistory : local.surgery, 'long'],
    ['allergies', '药物过敏史', p ? p.allergies.join('；') : local.allergies, 'long'],
    ['pregnancyHistory', '孕产与妇科手术史', p ? p.pregnancyHistory ?? '' : local.pregnancyHistory, 'long'],
    ['familyHistory', '重要家族史', p ? p.familyHistory ?? '' : local.familyHistory, 'long'],
    ['screeningHistory', '近期重要筛查', p ? p.screenings ?? '' : local.screeningHistory, 'long'],
  ];
  const summaries: typeof fields = [
    ['menstrual', '月经状态', source?.summary.menstrual ?? '', 'long'],
    ['symptoms', '身体症状', source?.summary.symptoms.map(item => `${item.symptom}：记录 ${item.days} 天`).join('；') ?? '', 'long'],
    ['sleepMood', '睡眠与情绪', '', 'long'],
    ['exercise', '运动情况', source?.summary.exercise ?? '', 'long'],
  ];
  const connectedFields: typeof fields = [
    ['chiefComplaint', '就诊诉求', p?.chiefComplaint ?? '', 'long'],
    ...Object.entries({menstrual:'月经与出血',vasomotor:'潮热与出汗',sleep:'睡眠',mood:'情绪',somatic:'神经与躯体症状',genitourinary:'泌尿生殖症状',otherSymptoms:'其他症状',weight:'体重变化',appetite:'食欲',exercise:'运动',lifestyle:'饮食与生活习惯',medicationHistory:'用药记录',lifeImpact:'近期生活事件',other:'其他健康记录'}).map(([key,label]) => [key,label,source?.fields?.[key]?.text ?? '', 'long'] as typeof fields[number]),
    // Preserve unsplittable edits from v1 drafts, including deliberate clears.
    ...['symptoms','sleepMood'].filter(key => Object.hasOwn(overrides,key)).map(key => [key,key === 'symptoms' ? '原身体症状补充' : '原睡眠情绪补充','', 'long'] as typeof fields[number]),
  ];
  const saveDraft = async () => {
    if (!source || saving) return;
    setSaving(true);
    try {
      const saved = await services.reports.saveDraft({ id: draft?.id, range, snapshot: source, overrides });
      onDraftSaved(saved);
      toast.add({ title: '报告草稿已保存', description: '仅保存到这份报告，不会修改健康卡片或我的资料。', type: 'success' });
    } catch { toast.add({ title: '草稿保存失败，请稍后重试', type: 'error' }); }
    finally { setSaving(false); }
  };
  const renderField = ([key, label, original, kind]: typeof fields[number]) => {
    const value = overrides[key] ?? original;
    const change = (value: string) => setOverrides(current => ({ ...current, [key]: value }));
    return (
      <div className="report-form-field" key={key}>
        <label htmlFor={`report-inline-${key}`}>{label}</label>
        <div className="report-field-content">
        {kind === 'short' ? (
          <Input id={`report-inline-${key}`} inputMode={key === 'height' ? 'decimal' : 'numeric'} value={value} disabled={saving} placeholder="待补充" onChange={event => change(event.target.value)} />
        ) : kind === 'select' ? (
          <select id={`report-inline-${key}`} value={value} disabled={saving} onChange={event => change(event.target.value)}>
            <option value="">请选择</option>
            {value && !['未绝经', '围绝经期', '绝经后', '不确定'].includes(value) && <option value={value}>{value}</option>}
            {['未绝经', '围绝经期', '绝经后', '不确定'].map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <Textarea id={`report-inline-${key}`} value={value} disabled={saving} rows={2} placeholder="待补充" onChange={event => change(event.target.value)} />
        )}
        {source?.fields?.[key]?.notice && <p className="report-source-notice">{source.fields[key].notice}</p>}
        {source?.fields?.[key]?.details && <details className="report-source-details"><summary>查看来源记录</summary><p>{source.fields[key].details}</p></details>}
        </div>
      </div>
    );
  };
  return (
    <DetailWorkspace
      header={<PageHeader title="就医报告预览" onBack={back} />}
      footer={
        <div className="report-actions report-footer-actions">
          <Button variant="outline" disabled={saving || !source} onClick={() => void saveDraft()}>{saving ? '正在保存…' : '保存草稿'}</Button>
          <Button onClick={() => toast.add({ title: 'PDF 导出将在下一版接入', description: '当前可先保存独立报告草稿。' })}>确认并生成 PDF</Button>
          <Button variant="outline" size="icon" disabled aria-label="分享报告"><Share2 /></Button>
        </div>
      }
    >
      <div className="report-range">统计范围　{source ? `${source.range.startDate} 至 ${source.range.endDate}` : '正在准备报告数据'}</div>
      <div className="info-callout">这是一份独立报告快照；在这里补充或修改的信息，不会影响健康卡片和我的资料。</div>
      <section className="report-form-section">
        <h3>基础信息</h3>
        <div className="report-form-card">{fields.map(renderField)}</div>
      </section>
      <section className="report-form-section">
        <h3>健康记录汇总</h3>
        <div className="report-form-card">{(source?.fields ? connectedFields : summaries).map(renderField)}</div>
      </section>
    </DetailWorkspace>
  );
}

function Expression({
  back,
  input,
  setInput,
  polished,
  setPolished,
}: {
  back: () => void;
  input: string;
  setInput: (v: string) => void;
  polished: string;
  setPolished: (v: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [audience, setAudience] = useState<
    '伴侣' | '家人' | '朋友' | '同事' | '不指定'
  >('家人');
  const [recording, setRecording] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const updateInput = (value: string) => {
    setInput(value.slice(0, 500));
    if (polished) setPolished('');
  };
  const organize = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      setPolished(await services.rephrase.rephrase(input, { audience }));
      toast.add({ title: '已经帮你整理好了', type: 'success' });
    } catch {
      toast.add({ title: '暂时无法整理，请稍后重试', type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      toast.add({ title: '当前浏览器不支持录音', type: 'error' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setSpeechBusy(true);
        try {
          const transcript = await services.speech.transcribe(
            audio,
            Date.now() - startedRef.current,
            createClientId(),
          );
          if (transcript) {
            updateInput(transcript);
            toast.add({ title: '语音已转成文字', type: 'success' });
          }
        } catch {
          toast.add({ title: '语音识别失败，请重试', type: 'error' });
        } finally {
          setSpeechBusy(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.add({
        title: '无法使用麦克风',
        description: '请允许浏览器访问麦克风',
        type: 'error',
      });
    }
  };
  const copy = async () => {
    if (!polished) return;
    try {
      await navigator.clipboard.writeText(polished);
      toast.add({ title: '已复制，可以去粘贴发送了', type: 'success' });
    } catch {
      toast.add({ title: '复制失败，请长按文本复制', type: 'error' });
    }
  };
  const share = async () => {
    if (!polished) return;
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      await navigator.share({ text: polished });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.add({ title: '暂时无法分享，请复制后发送', type: 'error' });
    }
  };
  return (
    <div className="expression-workspace">
      <PageHeader
        title="AI 帮我说"
        subtitle="把难开口的话，整理得温和而清楚"
        onBack={back}
      />
      <div className="expression-progress" aria-label="使用步骤">
        <span className="active">
          <i>1</i>说出想法
        </span>
        <span className={polished ? 'active' : ''}>
          <i>2</i>整理表达
        </span>
        <span>
          <i>3</i>复制发送
        </span>
      </div>
      <div className="expression-scroll">
        <section className="expression-compose">
          <fieldset>
            <legend>你想对谁说？</legend>
            <div className="audience-options">
              {(['伴侣', '家人', '朋友', '同事', '不指定'] as const).map(
                (item) => (
                  <button
                    type="button"
                    className={audience === item ? 'active' : ''}
                    aria-pressed={audience === item}
                    onClick={() => {
                      setAudience(item);
                      if (polished) setPolished('');
                    }}
                    key={item}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </fieldset>
          <label className="expression-input-label" htmlFor="expression-input">
            <span>你原本想说的话</span>
            <small>不用组织语言，想到什么就写什么</small>
          </label>
          <div className="textarea-wrap">
            <Textarea
              id="expression-input"
              className="large-textarea"
              placeholder="例如：我最近身体不太舒服，希望你能多听听我的感受……"
              value={input}
              onChange={(event) => updateInput(event.target.value)}
              maxLength={500}
            />
            <span>{input.length}/500</span>
          </div>
          <div className="expression-input-actions">
            <p>
              <LockKeyhole />
              仅用于本次表达整理，不会写入健康卡片
            </p>
            <button
              type="button"
              className={recording ? 'recording' : ''}
              onClick={() => void toggleRecording()}
              disabled={speechBusy || loading}
            >
              <Mic />
              {speechBusy ? '正在转写' : recording ? '点击结束' : '语音输入'}
            </button>
          </div>
          <Button
            className="expression-organize"
            onClick={() => void organize()}
            disabled={loading || !input.trim()}
          >
            <Sparkles />
            {loading ? '正在整理…' : '帮我整理表达'}
          </Button>
        </section>
        {polished ? (
          <section className="expression-result">
            <header>
              <div>
                <small>整理完成</small>
                <h3>你可以直接编辑这段话</h3>
              </div>
              <Pencil />
            </header>
            <Textarea
              aria-label="整理后的表达"
              value={polished}
              onChange={(event) =>
                setPolished(event.target.value.slice(0, 1000))
              }
            />
            <button
              type="button"
              className="regenerate"
              onClick={() => void organize()}
              disabled={loading}
            >
              <Sparkles />
              重新整理一版
            </button>
            <div className="expression-share-actions">
              <Button variant="outline" onClick={() => void copy()}>
                <Copy />
                复制
              </Button>
              <Button onClick={() => void share()}>
                <Share2 />
                发送 / 系统分享
              </Button>
            </div>
          </section>
        ) : (
          <section className="expression-empty">
            <FileText />
            <div>
              <b>整理后会显示在这里</b>
              <p>AI 会保留事实和你的真实诉求，不替你添加没有说过的内容。</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Achievements({ back }: { back: () => void }) {
  const achievements = useAchievements();
  const [selected, setSelected] = useState<Achievement | null>(null);
  return (
    <DetailWorkspace
      header={
        <PageHeader
          title="我的成就"
          subtitle="每一次坚持，都值得被看见"
          onBack={back}
        />
      }
    >
      <div className="badge-grid" aria-label="成就列表">
        {achievements.map((achievement) => {
          const earned = Boolean(achievement.achievedAt);
          return <button
            type="button"
            className={`badge-item badge-${achievement.group} ${earned ? 'earned' : 'locked'}`}
            key={achievement.id}
            onClick={() => setSelected(achievement)}
            aria-label={`${achievement.name}，${earned ? '已达成' : '未达成'}`}
          >
            <span className="badge-icon">
              <AchievementIcon group={achievement.group} />
              {!earned && <LockKeyhole />}
            </span>
            <small>{achievement.name}</small>
          </button>;
        })}
      </div>
      {selected && <div className="achievement-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
        <section className="achievement-modal" role="dialog" aria-modal="true" aria-labelledby="achievement-modal-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="achievement-modal-close" aria-label="关闭" onClick={() => setSelected(null)}><X /></button>
          <span className={`achievement-modal-icon badge-${selected.group} ${selected.achievedAt ? 'earned' : 'locked'}`}><AchievementIcon group={selected.group} /></span>
          <h2 id="achievement-modal-title">{selected.name}</h2>
          <p>{selected.description}</p>
          {selected.achievedAt ? <b>达成于 {selected.achievedAt}</b> : <small>尚未达成</small>}
        </section>
      </div>}
    </DetailWorkspace>
  );
}
function Personal({
  back,
  profile,
  prefill,
  setProfile,
}: {
  back: () => void;
  profile: ProfileData;
  prefill: Record<string, string> | null;
  setProfile: (value: ProfileData) => void;
}) {
  const [draft, setDraft] = useState<ProfileData>({
    ...profile,
    birth: prefill?.birthYear ?? profile.birth,
    history: prefill?.medicalHistory ?? profile.history,
    surgery: prefill?.surgeryHistory ?? profile.surgery,
  });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<ProfileData>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const save = async () => {
    const year = Number(draft.birth);
    const height = draft.height === '' ? null : Number(draft.height);
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date().getFullYear()
    ) {
      toast.add({ title: '请填写正确的出生年份', type: 'error' });
      return;
    }
    if (!draft.menopausalStatus) {
      toast.add({
        title: '请选择绝经阶段；不确定可选择“不确定”',
        type: 'error',
      });
      return;
    }
    if (
      height !== null &&
      (!Number.isInteger(height) || height < 80 || height > 250)
    ) {
      toast.add({ title: '请填写正确的身高', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await services.profile.update({
        birthYear: year,
        heightCm: height,
        menopausalStatus: draft.menopausalStatus,
        medicalHistory: draft.history.trim(),
        surgeryHistory: draft.surgery.trim(),
        allergyHistory: draft.allergies.trim(),
        regularMedications: draft.regularMedications.trim(),
        pregnancyHistory: draft.pregnancyHistory.trim(),
        familyHistory: draft.familyHistory.trim(),
        screeningHistory: draft.screeningHistory.trim(),
      });
      setProfile(draft);
      toast.add({ title: '个人资料已保存', type: 'success' });
      back();
    } catch {
      toast.add({ title: '资料保存失败，请稍后重试', type: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="personal-view">
      <PageHeader
        title="我的资料"
        subtitle="用于生成更完整的就医报告"
        onBack={back}
      />
      <div className="personal-editor">
        {prefill && (
          <div className="info-callout">
            小年已根据对话预填资料，请核对后保存；未保存不会写入账户。
          </div>
        )}
        <section className="personal-form editable personal-section personal-section-basic">
          <h3>基础信息</h3>
          <label htmlFor="profile-birth">
            <span>
              出生年份 <i>必填</i>
            </span>
            <Input
              id="profile-birth"
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              value={draft.birth}
              onChange={(e) => update({ birth: e.target.value })}
            />
          </label>
          <label htmlFor="profile-height">
            <span>身高（cm）</span>
            <Input
              id="profile-height"
              type="number"
              min="80"
              max="250"
              placeholder="如：165"
              value={draft.height}
              onChange={(e) => update({ height: e.target.value })}
            />
          </label>
          <label htmlFor="profile-menopause">
            <span>
              绝经阶段 <i>必填</i>
            </span>
            <select
              id="profile-menopause"
              value={draft.menopausalStatus}
              onChange={(e) =>
                update({
                  menopausalStatus: e.target
                    .value as ProfileData['menopausalStatus'],
                })
              }
            >
              <option value="">请选择</option>
              <option>未绝经</option>
              <option>围绝经期</option>
              <option>绝经后</option>
              <option>不确定</option>
            </select>
          </label>
        </section>
        <section className="personal-form editable personal-section">
          <h3>病史与安全信息</h3>
          <label htmlFor="profile-history">
            <span>既往病史</span>
            <Textarea
              id="profile-history"
              placeholder="没有可填写“无”"
              value={draft.history}
              onChange={(e) =>
                update({ history: e.target.value.slice(0, 1000) })
              }
            />
          </label>
          <label htmlFor="profile-surgery">
            <span>手术史</span>
            <Textarea
              id="profile-surgery"
              placeholder="没有可填写“无”"
              value={draft.surgery}
              onChange={(e) =>
                update({ surgery: e.target.value.slice(0, 1000) })
              }
            />
          </label>
          <label htmlFor="profile-allergies">
            <span>药物过敏史</span>
            <Textarea
              id="profile-allergies"
              placeholder="没有可填写“无”或“不清楚”"
              value={draft.allergies}
              onChange={(e) =>
                update({ allergies: e.target.value.slice(0, 1000) })
              }
            />
          </label>
          <label htmlFor="profile-medications">
            <span>长期/规律用药</span>
            <Textarea
              id="profile-medications"
              placeholder="如：药名、用途"
              value={draft.regularMedications}
              onChange={(e) =>
                update({ regularMedications: e.target.value.slice(0, 1000) })
              }
            />
          </label>
        </section>
        <section className="personal-form editable personal-section">
          <h3>妇科与家族背景</h3>
          <label htmlFor="profile-pregnancy">
            <span>孕产与妇科手术史</span>
            <Textarea
              id="profile-pregnancy"
              placeholder="如：1次妊娠、1次分娩"
              value={draft.pregnancyHistory}
              onChange={(e) =>
                update({ pregnancyHistory: e.target.value.slice(0, 1000) })
              }
            />
          </label>
          <label htmlFor="profile-family">
            <span>重要家族史</span>
            <Textarea
              id="profile-family"
              placeholder="如：母亲高血压；不清楚可不填"
              value={draft.familyHistory}
              onChange={(e) =>
                update({ familyHistory: e.target.value.slice(0, 1000) })
              }
            />
          </label>
          <label htmlFor="profile-screening">
            <span>近期重要筛查</span>
            <Textarea
              id="profile-screening"
              placeholder="如：2025年乳腺超声，未见异常"
              value={draft.screeningHistory}
              onChange={(e) =>
                update({ screeningHistory: e.target.value.slice(0, 1000) })
              }
            />
          </label>
        </section>
        <p className="privacy">
          <LockKeyhole />
          仅保存在你的账户中，你可以随时修改
        </p>
      </div>
      <div className="personal-save">
        <Button
          className="primary-wide"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存资料'}
        </Button>
      </div>
    </div>
  );
}
