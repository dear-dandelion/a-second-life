-- Daily cards remain the source of truth, but writes are now category-scoped.
alter table public.health_records add column if not exists version integer not null default 0 check (version >= 0);

-- These values used to duplicate the daily-card date. Keep the legacy columns
-- internally aligned while the public record JSON no longer exposes them.
update public.menstrual_records m set event_date = r.record_date from public.health_records r where r.id = m.record_id and m.event_date is distinct from r.record_date;
update public.weight_records w set record_date = r.record_date from public.health_records r where r.id = w.record_id and w.record_date is distinct from r.record_date;

create or replace function public.get_health_record(target_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := public.require_self_user(); rid uuid; record_version integer;
begin
  select id, version into rid, record_version from public.health_records where user_id = uid and record_date = target_date;
  return jsonb_build_object('record', case when rid is null then null else (public.health_record_json(rid) #- '{menstrual,date}' #- '{weight,date}') || jsonb_build_object('version', record_version) end);
end;
$$;

create or replace function public.patch_health_record(
  target_date date,
  expected_version integer,
  payload jsonb,
  categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  rid uuid;
  current_version integer;
  item jsonb;
  category text;
  updated timestamptz;
begin
  if target_date > (now() at time zone 'Asia/Shanghai')::date
    or expected_version < 0
    or payload is null or jsonb_typeof(payload) <> 'object'
    or categories is null or cardinality(categories) = 0
    or exists (select 1 from unnest(categories) c where c not in ('symptom','mood','sleep','menstrual','weight','appetite','exercise','diet','medication','lifeEvent','medicalNeed','other')) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select id, version into rid, current_version from public.health_records
    where user_id = uid and record_date = target_date for update;
  if rid is null then
    if expected_version <> 0 then raise exception using errcode = 'P0001', message = 'RECORD_VERSION_CONFLICT'; end if;
    insert into public.health_records(user_id, record_date) values (uid, target_date) returning id, version into rid, current_version;
  elsif current_version <> expected_version then
    raise exception using errcode = 'P0001', message = 'RECORD_VERSION_CONFLICT';
  end if;

  if 'appetite' = any(categories) or 'medicalNeed' = any(categories) or 'other' = any(categories) then
    update public.health_records set
      appetite = case when 'appetite' = any(categories) then nullif(payload ->> 'appetite', '') else appetite end,
      medical_needs = case when 'medicalNeed' = any(categories) then nullif(payload ->> 'medicalNeeds', '') else medical_needs end,
      other = case when 'other' = any(categories) then nullif(payload ->> 'other', '') else other end
    where id = rid;
  end if;

  if 'symptom' = any(categories) then
    delete from public.symptom_records where record_id = rid;
    for item in select * from jsonb_array_elements(coalesce(payload -> 'symptoms', '[]'::jsonb)) loop
      if nullif(item ->> 'symptom', '') is not null then insert into public.symptom_records(record_id, symptom, occurred, severity, frequency, frequency_count, trend, trigger, quote)
        values (rid, item ->> 'symptom', coalesce((item ->> 'occurred')::boolean, true), nullif(item ->> 'severity', '')::public.severity_type, nullif(item ->> 'frequency', ''), nullif(item ->> 'frequencyCount', '')::integer, nullif(item ->> 'trend', '')::public.trend_type, nullif(item ->> 'trigger', ''), coalesce(item ->> 'quote', '用户手动填写')); end if;
    end loop;
  end if;
  if 'sleep' = any(categories) then delete from public.sleep_records where record_id = rid; item := payload -> 'sleep'; if item is not null and item <> 'null'::jsonb then insert into public.sleep_records(record_id, quality, bedtime, wake_time, night_wakes, detail) values (rid, nullif(item ->> 'quality', '')::public.sleep_quality_type, nullif(item ->> 'bedtime', '')::time, nullif(item ->> 'wakeTime', '')::time, nullif(item ->> 'nightWakes', '')::integer, nullif(item ->> 'detail', '')); end if; end if;
  if 'mood' = any(categories) then delete from public.mood_records where record_id = rid; item := payload -> 'mood'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'state', '') is not null then insert into public.mood_records(record_id, state, intensity, description, trigger, source, confidence, quote) values (rid, (item ->> 'state')::public.mood_state_type, nullif(item ->> 'intensity', '')::public.mood_intensity_type, coalesce(item ->> 'description', ''), nullif(item ->> 'trigger', ''), coalesce(nullif(item ->> 'source', ''), 'manual'), nullif(item ->> 'confidence', '')::numeric, nullif(item ->> 'quote', '')); end if; end if;
  if 'menstrual' = any(categories) then delete from public.menstrual_records where record_id = rid; item := payload -> 'menstrual'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'event', '') is not null then insert into public.menstrual_records(record_id, event, event_date, days_since_last, note) values (rid, (item ->> 'event')::public.menstrual_event_type, target_date, nullif(item ->> 'daysSinceLast', '')::integer, nullif(item ->> 'note', '')); end if; end if;
  if 'weight' = any(categories) then delete from public.weight_records where record_id = rid; item := payload -> 'weight'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'direction', '') is not null then insert into public.weight_records(record_id, direction, amount, speed, record_date) values (rid, item ->> 'direction', nullif(item ->> 'amount', ''), nullif(item ->> 'speed', ''), target_date); end if; end if;
  if 'exercise' = any(categories) then delete from public.exercise_records where record_id = rid; item := payload -> 'exercise'; if item is not null and item <> 'null'::jsonb and nullif(item ->> 'type', '') is not null then insert into public.exercise_records(record_id, type, duration, frequency, intensity) values (rid, item ->> 'type', nullif(item ->> 'duration', ''), nullif(item ->> 'frequency', ''), nullif(item ->> 'intensity', '')); end if; end if;
  if 'diet' = any(categories) then delete from public.diet_records where record_id = rid; item := payload -> 'diet'; if item is not null and item <> 'null'::jsonb then insert into public.diet_records(record_id, meals_regular, foods, water, caffeine, alcohol, smoking) values (rid, case when item ? 'mealsRegular' then (item ->> 'mealsRegular')::boolean else null end, coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'foods', '[]'::jsonb))), '{}'), nullif(item ->> 'water', ''), nullif(item ->> 'caffeine', ''), nullif(item ->> 'alcohol', ''), case when item ? 'smoking' then (item ->> 'smoking')::boolean else null end); end if; end if;
  if 'medication' = any(categories) then delete from public.medication_mentions where record_id = rid; for item in select * from jsonb_array_elements(coalesce(payload -> 'medications', '[]'::jsonb)) loop if nullif(item ->> 'name', '') is not null and nullif(item ->> 'action', '') is not null then insert into public.medication_mentions(record_id, name, action) values (rid, item ->> 'name', (item ->> 'action')::public.medication_action_type); end if; end loop; end if;
  if 'lifeEvent' = any(categories) then delete from public.life_event_records where record_id = rid; for item in select * from jsonb_array_elements(coalesce(payload -> 'lifeEvents', '[]'::jsonb)) loop if nullif(item ->> 'description', '') is not null then insert into public.life_event_records(record_id, category, description, impact) values (rid, item ->> 'category', item ->> 'description', item ->> 'impact'); end if; end loop; end if;

  update public.health_records set version = version + 1, updated_at = now() where id = rid returning version, updated_at into current_version, updated;
  return jsonb_build_object('recordId', rid, 'recordDate', to_char(target_date, 'YYYY-MM-DD'), 'version', current_version, 'updatedAt', updated);
exception when invalid_text_representation or check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
end;
$$;
