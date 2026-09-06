-- Add duration metrics used by the monthly sleep chart.
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
      'nightWakes', sl.night_wakes,
      'durationMinutes', case when sl.bedtime is not null and sl.wake_time is not null then
        floor(extract(epoch from (
          (d.day::date + sl.wake_time + case when sl.wake_time <= sl.bedtime then interval '1 day' else interval '0 day' end)
          - (d.day::date + sl.bedtime)
        )) / 60)::integer
      else null end
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
