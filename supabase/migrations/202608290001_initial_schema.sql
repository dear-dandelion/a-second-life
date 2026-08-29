-- She Nicest MVP backend schema.
-- All health data is private and protected by RLS. AI drafts never become
-- official records until health-card-confirm or save_health_record succeeds.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

set search_path = public, extensions;

create type public.user_type as enum ('self_user', 'supporter');
create type public.severity_type as enum ('轻', '中', '重');
create type public.trend_type as enum ('加重', '减轻', '稳定');
create type public.sleep_quality_type as enum ('好', '一般', '差');
create type public.mood_type as enum ('负面', '正面');
create type public.menstrual_event_type as enum ('来了', '没来', '量多', '量少', '淋漓不尽', '非经期出血', '痛经', '停经');
create type public.medication_action_type as enum ('服用', '漏服', '停用');
create type public.knowledge_status as enum ('draft', 'published', 'archived');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_type public.user_type not null default 'self_user',
  birth_year integer check (birth_year between 1900 and extract(year from current_date)::integer),
  medical_history text not null default '',
  surgery_history text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_type text;
begin
  requested_type := coalesce(new.raw_user_meta_data ->> 'user_type', 'self_user');
  insert into public.profiles (id, user_type)
  values (
    new.id,
    case when requested_type = 'supporter' then 'supporter'::public.user_type else 'self_user'::public.user_type end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_type()
returns public.user_type
language sql
stable
security definer
set search_path = public
as $$
  select p.user_type from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.require_self_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if coalesce(public.current_user_type(), 'supporter'::public.user_type) <> 'self_user'::public.user_type then
    raise exception using errcode = 'P0001', message = 'ROLE_NOT_ALLOWED';
  end if;
  return uid;
end;
$$;

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_sessions_user_updated_idx on public.chat_sessions(user_id, updated_at desc);
create trigger chat_sessions_set_updated_at before update on public.chat_sessions
for each row execute function public.set_updated_at();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  client_message_id text,
  speakable_text text,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'completed' check (status in ('sending', 'streaming', 'completed', 'failed', 'stopped')),
  reply_to_message_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, client_message_id),
  unique (reply_to_message_id)
);
create index chat_messages_session_created_idx on public.chat_messages(session_id, created_at);

create table public.chat_card_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete cascade,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  record_date date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  processed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index chat_card_drafts_user_created_idx on public.chat_card_drafts(user_id, created_at desc);

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  appetite text check (appetite in ('增加', '减少', '正常')),
  medical_needs text,
  other text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);
create index health_records_user_date_idx on public.health_records(user_id, record_date desc);
create trigger health_records_set_updated_at before update on public.health_records
for each row execute function public.set_updated_at();

create table public.symptom_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.health_records(id) on delete cascade,
  symptom text not null,
  occurred boolean not null default true,
  severity public.severity_type,
  frequency text,
  frequency_count integer check (frequency_count >= 0),
  trend public.trend_type,
  trigger text,
  quote text not null default '',
  created_at timestamptz not null default now()
);
create index symptom_records_record_idx on public.symptom_records(record_id);
create index symptom_records_name_idx on public.symptom_records(symptom);

create table public.sleep_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  quality public.sleep_quality_type,
  bedtime time,
  wake_time time,
  night_wakes integer check (night_wakes >= 0),
  detail text,
  created_at timestamptz not null default now()
);

create table public.mood_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  type public.mood_type not null,
  description text not null,
  trigger text,
  created_at timestamptz not null default now()
);

create table public.menstrual_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  event public.menstrual_event_type not null,
  event_date date,
  days_since_last integer check (days_since_last >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.weight_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  direction text not null check (direction in ('增加', '减少')),
  amount text,
  speed text check (speed in ('突然', '缓慢')),
  record_date date not null,
  created_at timestamptz not null default now()
);

create table public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  type text not null,
  duration text,
  frequency text,
  intensity text check (intensity in ('轻松', '适中', '累')),
  created_at timestamptz not null default now()
);

create table public.diet_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references public.health_records(id) on delete cascade,
  meals_regular boolean,
  foods text[] not null default '{}',
  water text check (water in ('充足', '偏少')),
  caffeine text,
  alcohol text,
  smoking boolean,
  created_at timestamptz not null default now()
);

create table public.medication_mentions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.health_records(id) on delete cascade,
  name text not null,
  action public.medication_action_type not null,
  created_at timestamptz not null default now()
);
create index medication_mentions_record_idx on public.medication_mentions(record_id);

create table public.life_event_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.health_records(id) on delete cascade,
  category text not null check (category in ('家庭', '社交', '心情事件')),
  description text not null,
  impact text not null check (impact in ('正面', '负面', '中性')),
  created_at timestamptz not null default now()
);
create index life_event_records_record_idx on public.life_event_records(record_id);

create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (date_trunc('month', month)::date = month),
  overview text not null,
  good_things jsonb not null default '[]'::jsonb check (jsonb_typeof(good_things) = 'array'),
  dimensions jsonb not null default '[]'::jsonb check (jsonb_typeof(dimensions) = 'array'),
  has_new boolean not null default true,
  source_version text not null default 'mvp-v1',
  generated_at timestamptz not null default now(),
  unique (user_id, month)
);
create index monthly_summaries_user_month_idx on public.monthly_summaries(user_id, month desc);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  title text not null,
  source text not null,
  source_url text,
  topic text,
  collected_on date,
  content_hash text not null,
  status public.knowledge_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null,
  content_hash text not null,
  embedding extensions.vector,
  embedding_model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index knowledge_chunks_document_idx on public.knowledge_chunks(document_id, chunk_index);
create index knowledge_chunks_content_trgm_idx on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);

create table public.idempotency_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, operation, idempotency_key)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_card_drafts enable row level security;
alter table public.health_records enable row level security;
alter table public.symptom_records enable row level security;
alter table public.sleep_records enable row level security;
alter table public.mood_records enable row level security;
alter table public.menstrual_records enable row level security;
alter table public.weight_records enable row level security;
alter table public.exercise_records enable row level security;
alter table public.diet_records enable row level security;
alter table public.medication_mentions enable row level security;
alter table public.life_event_records enable row level security;
alter table public.monthly_summaries enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.idempotency_results enable row level security;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy chat_sessions_own on public.chat_sessions for select using (user_id = auth.uid());
create policy chat_sessions_insert_own on public.chat_sessions for insert with check (user_id = auth.uid());
create policy chat_sessions_update_own on public.chat_sessions for update
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_messages_own on public.chat_messages for select using (user_id = auth.uid());
create policy chat_card_drafts_own on public.chat_card_drafts for select using (user_id = auth.uid());

create policy health_records_own on public.health_records for select using (
  user_id = auth.uid() and public.current_user_type() = 'self_user'
);

create policy symptom_records_own on public.symptom_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy sleep_records_own on public.sleep_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy mood_records_own on public.mood_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy menstrual_records_own on public.menstrual_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy weight_records_own on public.weight_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy exercise_records_own on public.exercise_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy diet_records_own on public.diet_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy medication_mentions_own on public.medication_mentions for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));
create policy life_event_records_own on public.life_event_records for select using (exists (
  select 1 from public.health_records r where r.id = record_id and r.user_id = auth.uid() and public.current_user_type() = 'self_user'
));

create policy monthly_summaries_own on public.monthly_summaries for select using (
  user_id = auth.uid() and public.current_user_type() = 'self_user'
);
create policy monthly_summaries_update_own on public.monthly_summaries for update using (
  user_id = auth.uid() and public.current_user_type() = 'self_user'
) with check (user_id = auth.uid() and public.current_user_type() = 'self_user');

-- Explicit table privileges. Sensitive writes happen through RPC/Edge Functions.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (birth_year, medical_history, surgery_history) on public.profiles to authenticated;
grant select on public.chat_sessions, public.chat_messages, public.chat_card_drafts to authenticated;
grant insert, update on public.chat_sessions to authenticated;
grant select on public.health_records, public.symptom_records, public.sleep_records,
  public.mood_records, public.menstrual_records, public.weight_records,
  public.exercise_records, public.diet_records, public.medication_mentions,
  public.life_event_records, public.monthly_summaries to authenticated;
grant update (has_new) on public.monthly_summaries to authenticated;

revoke all on public.knowledge_documents, public.knowledge_chunks,
  public.idempotency_results from anon, authenticated;

-- Build the canonical camelCase HealthRecord JSON for one private record.
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
    'symptoms', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', s.id, 'symptom', s.symptom, 'occurred', s.occurred,
        'severity', s.severity, 'frequency', s.frequency,
        'frequencyCount', s.frequency_count, 'trend', s.trend,
        'trigger', s.trigger, 'quote', s.quote
      )) order by s.created_at)
      from public.symptom_records s where s.record_id = r.id
    ), '[]'::jsonb),
    'mood', (select jsonb_strip_nulls(jsonb_build_object(
      'id', m.id, 'type', m.type, 'description', m.description, 'trigger', m.trigger
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
      'id', e.id, 'type', e.type, 'duration', e.duration,
      'frequency', e.frequency, 'intensity', e.intensity
    )) from public.exercise_records e where e.record_id = r.id),
    'diet', (select jsonb_strip_nulls(jsonb_build_object(
      'id', d.id, 'mealsRegular', d.meals_regular, 'foods', to_jsonb(d.foods),
      'water', d.water, 'caffeine', d.caffeine, 'alcohol', d.alcohol, 'smoking', d.smoking
    )) from public.diet_records d where d.record_id = r.id),
    'medications', coalesce((select jsonb_agg(jsonb_build_object(
      'id', mm.id, 'name', mm.name, 'action', mm.action
    ) order by mm.created_at) from public.medication_mentions mm where mm.record_id = r.id), '[]'::jsonb),
    'lifeEvents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', le.id, 'category', le.category, 'description', le.description, 'impact', le.impact
    ) order by le.created_at) from public.life_event_records le where le.record_id = r.id), '[]'::jsonb),
    'medicalNeeds', r.medical_needs,
    'other', r.other
  )
  from public.health_records r
  where r.id = p_record_id;
$$;

create or replace function public.get_health_record(target_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  rid uuid;
begin
  select id into rid from public.health_records
  where user_id = uid and record_date = target_date;
  return jsonb_build_object('record', case when rid is null then null else public.health_record_json(rid) end);
end;
$$;

create or replace function public.save_health_record(target_date date, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  rid uuid;
  item jsonb;
  updated timestamptz;
begin
  if target_date > (now() at time zone 'Asia/Shanghai')::date then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  insert into public.health_records(user_id, record_date, appetite, medical_needs, other)
  values (uid, target_date, nullif(payload ->> 'appetite', ''), nullif(payload ->> 'medicalNeeds', ''), nullif(payload ->> 'other', ''))
  on conflict (user_id, record_date) do update
    set appetite = excluded.appetite,
        medical_needs = excluded.medical_needs,
        other = excluded.other,
        updated_at = now()
  returning id, updated_at into rid, updated;

  delete from public.symptom_records where record_id = rid;
  delete from public.sleep_records where record_id = rid;
  delete from public.mood_records where record_id = rid;
  delete from public.menstrual_records where record_id = rid;
  delete from public.weight_records where record_id = rid;
  delete from public.exercise_records where record_id = rid;
  delete from public.diet_records where record_id = rid;
  delete from public.medication_mentions where record_id = rid;
  delete from public.life_event_records where record_id = rid;

  for item in select * from jsonb_array_elements(coalesce(payload -> 'symptoms', '[]'::jsonb)) loop
    if nullif(item ->> 'symptom', '') is not null then
      insert into public.symptom_records(
        record_id, symptom, occurred, severity, frequency, frequency_count, trend, trigger, quote
      ) values (
        rid, item ->> 'symptom', coalesce((item ->> 'occurred')::boolean, true),
        nullif(item ->> 'severity', '')::public.severity_type,
        nullif(item ->> 'frequency', ''), nullif(item ->> 'frequencyCount', '')::integer,
        nullif(item ->> 'trend', '')::public.trend_type,
        nullif(item ->> 'trigger', ''), coalesce(item ->> 'quote', '用户手动填写')
      );
    end if;
  end loop;

  item := payload -> 'sleep';
  if item is not null and item <> 'null'::jsonb then
    insert into public.sleep_records(record_id, quality, bedtime, wake_time, night_wakes, detail)
    values (rid, nullif(item ->> 'quality', '')::public.sleep_quality_type,
      nullif(item ->> 'bedtime', '')::time, nullif(item ->> 'wakeTime', '')::time,
      nullif(item ->> 'nightWakes', '')::integer, nullif(item ->> 'detail', ''));
  end if;

  item := payload -> 'mood';
  if item is not null and item <> 'null'::jsonb and nullif(item ->> 'description', '') is not null then
    insert into public.mood_records(record_id, type, description, trigger)
    values (rid, (item ->> 'type')::public.mood_type, item ->> 'description', nullif(item ->> 'trigger', ''));
  end if;

  item := payload -> 'menstrual';
  if item is not null and item <> 'null'::jsonb and nullif(item ->> 'event', '') is not null then
    insert into public.menstrual_records(record_id, event, event_date, days_since_last, note)
    values (rid, (item ->> 'event')::public.menstrual_event_type,
      nullif(item ->> 'date', '')::date, nullif(item ->> 'daysSinceLast', '')::integer,
      nullif(item ->> 'note', ''));
  end if;

  item := payload -> 'weight';
  if item is not null and item <> 'null'::jsonb and nullif(item ->> 'direction', '') is not null then
    insert into public.weight_records(record_id, direction, amount, speed, record_date)
    values (rid, item ->> 'direction', nullif(item ->> 'amount', ''), nullif(item ->> 'speed', ''),
      coalesce(nullif(item ->> 'date', '')::date, target_date));
  end if;

  item := payload -> 'exercise';
  if item is not null and item <> 'null'::jsonb and nullif(item ->> 'type', '') is not null then
    insert into public.exercise_records(record_id, type, duration, frequency, intensity)
    values (rid, item ->> 'type', nullif(item ->> 'duration', ''),
      nullif(item ->> 'frequency', ''), nullif(item ->> 'intensity', ''));
  end if;

  item := payload -> 'diet';
  if item is not null and item <> 'null'::jsonb then
    insert into public.diet_records(record_id, meals_regular, foods, water, caffeine, alcohol, smoking)
    values (rid,
      case when item ? 'mealsRegular' then (item ->> 'mealsRegular')::boolean else null end,
      coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'foods', '[]'::jsonb))), '{}'),
      nullif(item ->> 'water', ''), nullif(item ->> 'caffeine', ''),
      nullif(item ->> 'alcohol', ''),
      case when item ? 'smoking' then (item ->> 'smoking')::boolean else null end);
  end if;

  for item in select * from jsonb_array_elements(coalesce(payload -> 'medications', '[]'::jsonb)) loop
    if nullif(item ->> 'name', '') is not null and nullif(item ->> 'action', '') is not null then
      insert into public.medication_mentions(record_id, name, action)
      values (rid, item ->> 'name', (item ->> 'action')::public.medication_action_type);
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload -> 'lifeEvents', '[]'::jsonb)) loop
    if nullif(item ->> 'description', '') is not null then
      insert into public.life_event_records(record_id, category, description, impact)
      values (rid, item ->> 'category', item ->> 'description', item ->> 'impact');
    end if;
  end loop;

  return jsonb_build_object(
    'recordId', rid,
    'recordDate', to_char(target_date, 'YYYY-MM-DD'),
    'updatedAt', updated
  );
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
end;
$$;

-- Confirm an AI draft atomically. The Edge Function prepares the merged canonical
-- record; this function locks the draft and commits the record, draft state and
-- idempotency response in one database transaction.
create or replace function public.confirm_health_card(
  draft_id uuid,
  selected_item_ids text[],
  payload jsonb,
  idempotency_key text,
  request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  draft public.chat_card_drafts%rowtype;
  previous public.idempotency_results%rowtype;
  save_result jsonb;
  response_body jsonb;
  selected_id text;
  operation_name text := 'health-card-confirm:' || draft_id::text;
begin
  if nullif(idempotency_key, '') is null or coalesce(array_length(selected_item_ids, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select * into previous from public.idempotency_results
  where user_id = uid and operation = operation_name
    and public.idempotency_results.idempotency_key = confirm_health_card.idempotency_key;
  if found then
    if previous.request_hash is distinct from request_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return previous.response;
  end if;

  select * into draft from public.chat_card_drafts
  where id = draft_id and user_id = uid
  for update;
  if not found or draft.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'DRAFT_NOT_FOUND';
  end if;
  if draft.processed_at is not null then
    raise exception using errcode = 'P0001', message = 'ITEM_ALREADY_SAVED';
  end if;

  foreach selected_id in array selected_item_ids loop
    if not exists (
      select 1 from jsonb_array_elements(draft.items) item
      where item ->> 'clientItemId' = selected_id
    ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
  end loop;

  save_result := public.save_health_record(draft.record_date, payload);
  response_body := jsonb_build_object(
    'recordId', save_result -> 'recordId',
    'recordDate', save_result -> 'recordDate',
    'savedItemCount', cardinality(selected_item_ids)
  );
  update public.chat_card_drafts set processed_at = now() where id = draft_id;
  insert into public.idempotency_results(user_id, operation, idempotency_key, request_hash, response)
  values (
    uid, operation_name, confirm_health_card.idempotency_key,
    confirm_health_card.request_hash, response_body
  );
  return response_body;
end;
$$;

create or replace function public.get_report_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  earliest date;
  latest date;
  ranges jsonb := '[]'::jsonb;
begin
  select min(record_date), max(record_date) into earliest, latest
  from public.health_records where user_id = uid;
  if earliest is not null then
    if earliest <= date_trunc('month', now() at time zone 'Asia/Shanghai')::date then ranges := ranges || '"1_month"'::jsonb; end if;
    if earliest <= (date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '2 months')::date then ranges := ranges || '"3_months"'::jsonb; end if;
    if earliest <= (date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '5 months')::date then ranges := ranges || '"6_months"'::jsonb; end if;
  end if;
  return jsonb_build_object(
    'hasAnyRecord', earliest is not null,
    'earliestRecordDate', case when earliest is null then null else to_char(earliest, 'YYYY-MM-DD') end,
    'latestRecordDate', case when latest is null then null else to_char(latest, 'YYYY-MM-DD') end,
    'availableRanges', ranges
  );
end;
$$;

create or replace function public.get_monthly_stats(target_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  month_start date;
  month_end date;
  result_days jsonb;
  recorded_days integer;
begin
  if target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  month_start := to_date(target_month || '-01', 'YYYY-MM-DD');
  month_end := (month_start + interval '1 month - 1 day')::date;
  select count(*) into recorded_days from public.health_records
  where user_id = uid and record_date between month_start and month_end;

  select jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'hasRecord', r.id is not null,
    'sleep', case when sl.id is null then null else jsonb_build_object(
      'quality', sl.quality,
      'qualityScore', case sl.quality when '差' then 1 when '一般' then 2 when '好' then 3 else null end,
      'nightWakes', sl.night_wakes
    ) end,
    'hotFlash', case when hf.id is null then null else jsonb_build_object(
      'occurred', hf.occurred,
      'frequencyCount', hf.frequency_count,
      'severity', hf.severity,
      'chartValue', case
        when hf.occurred = false then 0
        when hf.frequency_count is not null then hf.frequency_count
        when hf.severity = '轻' then 1 when hf.severity = '中' then 2 when hf.severity = '重' then 3
        else null end
    ) end,
    'mood', case when mo.id is null then null else jsonb_build_object(
      'type', mo.type, 'description', mo.description,
      'chartValue', case mo.type when '正面' then 1 when '负面' then -1 else null end
    ) end,
    'exercise', case when ex.id is null then null else jsonb_build_object(
      'type', ex.type, 'duration', ex.duration, 'intensity', ex.intensity
    ) end
  ) order by d.day) into result_days
  from generate_series(month_start, month_end, interval '1 day') d(day)
  left join public.health_records r on r.user_id = uid and r.record_date = d.day::date
  left join public.sleep_records sl on sl.record_id = r.id
  left join lateral (
    select s.* from public.symptom_records s
    where s.record_id = r.id and s.symptom = '潮热'
    order by s.created_at desc limit 1
  ) hf on true
  left join public.mood_records mo on mo.record_id = r.id
  left join public.exercise_records ex on ex.record_id = r.id;

  return jsonb_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'days', coalesce(result_days, '[]'::jsonb),
    'digest', case when recorded_days = 0 then null else jsonb_build_object(
      'text', format('本月已记录 %s 天。记录只用于回顾，不代表医学诊断。', recorded_days),
      'highlights', jsonb_build_array(format('累计记录 %s 天', recorded_days))
    ) end
  );
end;
$$;

create or replace function public.match_knowledge_chunks(
  query_text text,
  query_embedding extensions.vector default null,
  match_count integer default 5
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  source text,
  source_url text,
  topic text,
  collected_on date,
  content text,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id, d.id, d.title, d.source, d.source_url, d.topic, d.collected_on, c.content,
    case
      when query_embedding is not null and c.embedding is not null
        then 1 - (c.embedding <=> query_embedding)
      else greatest(
        similarity(c.content, query_text),
        similarity(d.title, query_text),
        case when position(query_text in c.content) > 0 then 0.95 else 0 end
      )
    end as score
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where d.status = 'published'
    and length(trim(query_text)) > 0
  order by score desc
  limit least(greatest(match_count, 1), 10);
$$;

grant execute on function public.get_health_record(date) to authenticated;
grant execute on function public.save_health_record(date, jsonb) to authenticated;
grant execute on function public.confirm_health_card(uuid, text[], jsonb, text, text) to authenticated;
grant execute on function public.get_report_coverage() to authenticated;
grant execute on function public.get_monthly_stats(text) to authenticated;
grant execute on function public.match_knowledge_chunks(text, extensions.vector, integer) to service_role;

-- Prevent clients from changing their role while allowing the three MVP profile fields.
revoke execute on function public.health_record_json(uuid) from public, anon, authenticated;
revoke execute on function public.require_self_user() from public, anon;
revoke execute on function public.current_user_type() from public, anon;
grant execute on function public.current_user_type() to authenticated;

revoke execute on function public.get_health_record(date) from public, anon;
revoke execute on function public.save_health_record(date, jsonb) from public, anon;
revoke execute on function public.confirm_health_card(uuid, text[], jsonb, text, text) from public, anon;
revoke execute on function public.get_report_coverage() from public, anon;
revoke execute on function public.get_monthly_stats(text) from public, anon;
revoke execute on function public.match_knowledge_chunks(text, extensions.vector, integer) from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
