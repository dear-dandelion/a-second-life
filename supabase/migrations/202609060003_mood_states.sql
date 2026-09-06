-- Replace the binary mood label with a small, usable set of everyday states.
do $$ begin
  create type public.mood_state_type as enum ('舒展', '平静', '低落', '焦虑', '烦躁', '复杂');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.mood_intensity_type as enum ('轻微', '明显', '强烈');
exception when duplicate_object then null;
end $$;

alter table public.mood_records rename column type to state;
alter table public.mood_records
  alter column state type public.mood_state_type using (
    case state::text when '正面' then '舒展' else '复杂' end
  )::public.mood_state_type;
alter table public.mood_records alter column description set default '';
alter table public.mood_records add column if not exists intensity public.mood_intensity_type;
alter table public.mood_records add column if not exists source text not null default 'manual'
  check (source in ('manual', 'ai'));
alter table public.mood_records add column if not exists confidence numeric
  check (confidence >= 0 and confidence <= 1);
alter table public.mood_records add column if not exists quote text;

create or replace function public.health_record_json(p_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'date', to_char(r.record_date, 'YYYY-MM-DD'),
    'symptoms', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', s.id, 'symptom', s.symptom, 'occurred', s.occurred,
      'severity', s.severity, 'frequency', s.frequency, 'frequencyCount', s.frequency_count,
      'trend', s.trend, 'trigger', s.trigger, 'quote', s.quote
    )) order by s.created_at) from public.symptom_records s where s.record_id = r.id), '[]'::jsonb),
    'mood', (select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id, 'state', m.state, 'intensity', m.intensity,
      'description', m.description, 'trigger', m.trigger, 'source', m.source,
      'confidence', m.confidence, 'quote', m.quote
    )) from public.mood_records m where m.record_id = r.id),
    'sleep', (select jsonb_strip_nulls(jsonb_build_object(
      'id', s.id, 'quality', s.quality,
      'bedtime', case when s.bedtime is null then null else to_char(s.bedtime, 'HH24:MI') end,
      'wakeTime', case when s.wake_time is null then null else to_char(s.wake_time, 'HH24:MI') end,
      'nightWakes', s.night_wakes, 'detail', s.detail
    )) from public.sleep_records s where s.record_id = r.id),
    'menstrual', (select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id, 'event', m.event,
      'date', case when m.event_date is null then null else to_char(m.event_date, 'YYYY-MM-DD') end,
      'daysSinceLast', m.days_since_last, 'note', m.note
    )) from public.menstrual_records m where m.record_id = r.id),
    'weight', (select jsonb_strip_nulls(jsonb_build_object(
      'id', w.id, 'direction', w.direction, 'amount', w.amount, 'speed', w.speed,
      'date', to_char(w.record_date, 'YYYY-MM-DD')
    )) from public.weight_records w where w.record_id = r.id),
    'appetite', r.appetite,
    'exercise', (select jsonb_strip_nulls(jsonb_build_object(
      'id', e.id, 'type', e.type, 'duration', e.duration, 'frequency', e.frequency, 'intensity', e.intensity
    )) from public.exercise_records e where e.record_id = r.id),
    'diet', (select jsonb_strip_nulls(jsonb_build_object(
      'id', d.id, 'mealsRegular', d.meals_regular, 'foods', to_jsonb(d.foods),
      'water', d.water, 'caffeine', d.caffeine, 'alcohol', d.alcohol, 'smoking', d.smoking
    )) from public.diet_records d where d.record_id = r.id),
    'medications', coalesce((select jsonb_agg(jsonb_build_object('id', mm.id, 'name', mm.name, 'action', mm.action) order by mm.created_at) from public.medication_mentions mm where mm.record_id = r.id), '[]'::jsonb),
    'lifeEvents', coalesce((select jsonb_agg(jsonb_build_object('id', le.id, 'category', le.category, 'description', le.description, 'impact', le.impact) order by le.created_at) from public.life_event_records le where le.record_id = r.id), '[]'::jsonb),
    'medicalNeeds', r.medical_needs, 'other', r.other
  ) from public.health_records r where r.id = p_record_id;
$$;

create or replace function public.save_health_record(target_date date, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := public.require_self_user(); rid uuid; item jsonb; updated timestamptz;
begin
  if target_date > (now() at time zone 'Asia/Shanghai')::date or payload is null or jsonb_typeof(payload) <> 'object' then raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR'; end if;
  insert into public.health_records(user_id, record_date, appetite, medical_needs, other)
  values (uid, target_date, nullif(payload ->> 'appetite', ''), nullif(payload ->> 'medicalNeeds', ''), nullif(payload ->> 'other', ''))
  on conflict (user_id, record_date) do update set appetite = excluded.appetite, medical_needs = excluded.medical_needs, other = excluded.other, updated_at = now()
  returning id, updated_at into rid, updated;
  delete from public.symptom_records where record_id = rid; delete from public.sleep_records where record_id = rid; delete from public.mood_records where record_id = rid;
  delete from public.menstrual_records where record_id = rid; delete from public.weight_records where record_id = rid; delete from public.exercise_records where record_id = rid;
  delete from public.diet_records where record_id = rid; delete from public.medication_mentions where record_id = rid; delete from public.life_event_records where record_id = rid;
  for item in select * from jsonb_array_elements(coalesce(payload -> 'symptoms', '[]'::jsonb)) loop
    if nullif(item ->> 'symptom', '') is not null then insert into public.symptom_records(record_id, symptom, occurred, severity, frequency, frequency_count, trend, trigger, quote)
      values (rid, item ->> 'symptom', coalesce((item ->> 'occurred')::boolean, true), nullif(item ->> 'severity', '')::public.severity_type, nullif(item ->> 'frequency', ''), nullif(item ->> 'frequencyCount', '')::integer, nullif(item ->> 'trend', '')::public.trend_type, nullif(item ->> 'trigger', ''), coalesce(item ->> 'quote', '用户手动填写')); end if;
  end loop;
  item := payload -> 'sleep'; if item is not null and item <> 'null'::jsonb then insert into public.sleep_records(record_id, quality, bedtime, wake_time, night_wakes, detail)
    values (rid, nullif(item ->> 'quality', '')::public.sleep_quality_type, nullif(item ->> 'bedtime', '')::time, nullif(item ->> 'wakeTime', '')::time, nullif(item ->> 'nightWakes', '')::integer, nullif(item ->> 'detail', '')); end if;
  item := payload -> 'mood'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'state', '') is not null then insert into public.mood_records(record_id, state, intensity, description, trigger, source, confidence, quote)
    values (rid, (item ->> 'state')::public.mood_state_type, nullif(item ->> 'intensity', '')::public.mood_intensity_type, coalesce(item ->> 'description', ''), nullif(item ->> 'trigger', ''), coalesce(nullif(item ->> 'source', ''), 'manual'), nullif(item ->> 'confidence', '')::numeric, nullif(item ->> 'quote', '')); end if;
  item := payload -> 'menstrual'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'event', '') is not null then insert into public.menstrual_records(record_id, event, event_date, days_since_last, note)
    values (rid, (item ->> 'event')::public.menstrual_event_type, nullif(item ->> 'date', '')::date, nullif(item ->> 'daysSinceLast', '')::integer, nullif(item ->> 'note', '')); end if;
  item := payload -> 'weight'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'direction', '') is not null then insert into public.weight_records(record_id, direction, amount, speed, record_date)
    values (rid, item ->> 'direction', nullif(item ->> 'amount', ''), nullif(item ->> 'speed', ''), coalesce(nullif(item ->> 'date', '')::date, target_date)); end if;
  item := payload -> 'exercise'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'type', '') is not null then insert into public.exercise_records(record_id, type, duration, frequency, intensity)
    values (rid, item ->> 'type', nullif(item ->> 'duration', ''), nullif(item ->> 'frequency', ''), nullif(item ->> 'intensity', '')); end if;
  item := payload -> 'diet'; if item is not null and item <> 'null'::jsonb then insert into public.diet_records(record_id, meals_regular, foods, water, caffeine, alcohol, smoking)
    values (rid, case when item ? 'mealsRegular' then (item ->> 'mealsRegular')::boolean else null end, coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'foods', '[]'::jsonb))), '{}'), nullif(item ->> 'water', ''), nullif(item ->> 'caffeine', ''), nullif(item ->> 'alcohol', ''), case when item ? 'smoking' then (item ->> 'smoking')::boolean else null end); end if;
  for item in select * from jsonb_array_elements(coalesce(payload -> 'medications', '[]'::jsonb)) loop if nullif(item ->> 'name', '') is not null and nullif(item ->> 'action', '') is not null then insert into public.medication_mentions(record_id, name, action) values (rid, item ->> 'name', (item ->> 'action')::public.medication_action_type); end if; end loop;
  for item in select * from jsonb_array_elements(coalesce(payload -> 'lifeEvents', '[]'::jsonb)) loop if nullif(item ->> 'description', '') is not null then insert into public.life_event_records(record_id, category, description, impact) values (rid, item ->> 'category', item ->> 'description', item ->> 'impact'); end if; end loop;
  return jsonb_build_object('recordId', rid, 'recordDate', to_char(target_date, 'YYYY-MM-DD'), 'updatedAt', updated);
exception when invalid_text_representation or check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR'; end;
$$;

create or replace function public.get_monthly_stats(target_month text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_self_user(); month_start date; month_end date; result_days jsonb; recorded_days integer;
begin
  if target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR'; end if;
  month_start := to_date(target_month || '-01', 'YYYY-MM-DD'); month_end := (month_start + interval '1 month - 1 day')::date;
  select count(*) into recorded_days from public.health_records where user_id = uid and record_date between month_start and month_end;
  select jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'), 'hasRecord', r.id is not null,
    'sleep', case when sl.id is null then null else jsonb_build_object('quality', sl.quality, 'qualityScore', case sl.quality when '差' then 1 when '一般' then 2 when '好' then 3 else null end, 'nightWakes', sl.night_wakes, 'durationMinutes', case when sl.bedtime is not null and sl.wake_time is not null then floor(extract(epoch from ((d.day::date + sl.wake_time + case when sl.wake_time <= sl.bedtime then interval '1 day' else interval '0 day' end) - (d.day::date + sl.bedtime))) / 60)::integer else null end) end,
    'hotFlash', case when hf.id is null then null else jsonb_build_object('occurred', hf.occurred, 'frequencyCount', hf.frequency_count, 'severity', hf.severity, 'chartValue', case when hf.occurred = false then 0 when hf.frequency_count is not null then hf.frequency_count when hf.severity = '轻' then 1 when hf.severity = '中' then 2 when hf.severity = '重' then 3 else null end) end,
    'mood', case when mo.id is null then null else jsonb_build_object('state', mo.state, 'intensity', mo.intensity, 'description', mo.description, 'chartValue', case mo.state when '舒展' then case mo.intensity when '强烈' then 3 when '明显' then 2 else 1 end when '低落' then -case mo.intensity when '强烈' then 3 when '明显' then 2 else 1 end when '焦虑' then -case mo.intensity when '强烈' then 3 when '明显' then 2 else 1 end when '烦躁' then -case mo.intensity when '强烈' then 3 when '明显' then 2 else 1 end else 0 end) end,
    'exercise', case when ex.id is null then null else jsonb_build_object('type', ex.type, 'duration', ex.duration, 'intensity', ex.intensity) end
  ) order by d.day) into result_days
  from generate_series(month_start, month_end, interval '1 day') d(day)
  left join public.health_records r on r.user_id = uid and r.record_date = d.day::date left join public.sleep_records sl on sl.record_id = r.id
  left join lateral (select s.* from public.symptom_records s where s.record_id = r.id and s.symptom = '潮热' order by s.created_at desc limit 1) hf on true
  left join public.mood_records mo on mo.record_id = r.id left join public.exercise_records ex on ex.record_id = r.id;
  return jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'days', coalesce(result_days, '[]'::jsonb), 'digest', case when recorded_days = 0 then null else jsonb_build_object('text', format('本月已记录 %s 天。每一次记录，都是更懂得照顾自己的一步。', recorded_days), 'highlights', jsonb_build_array(format('累计记录 %s 天', recorded_days))) end);
end;
$$;
