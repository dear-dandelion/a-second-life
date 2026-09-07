-- The range picker and report-preview must count exactly the same confirmed
-- daily records. Keep this calculation on the server, never in a paged client
-- list, so historical records cannot silently disappear from coverage.
create or replace function public.get_report_coverage_for_range(target_range text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_self_user();
  end_date date := (now() at time zone 'Asia/Shanghai')::date;
  start_date date;
  range_months integer;
  recorded_days integer;
  total_days integer;
begin
  range_months := case target_range
    when '1_month' then 1
    when '3_months' then 3
    when '6_months' then 6
    else null
  end;
  if range_months is null then
    raise exception 'REPORT_RANGE_INVALID';
  end if;

  start_date := (date_trunc('month', end_date) - make_interval(months => range_months))::date;
  total_days := end_date - start_date + 1;
  select count(*) into recorded_days
  from public.health_records
  where user_id = uid and record_date between start_date and end_date;

  return jsonb_build_object(
    'range', target_range,
    'startDate', to_char(start_date, 'YYYY-MM-DD'),
    'endDate', to_char(end_date, 'YYYY-MM-DD'),
    'totalDays', total_days,
    'recordedDays', recorded_days,
    'coveragePercent', case when total_days = 0 then 0 else round(recorded_days::numeric / total_days * 100) end
  );
end;
$$;

grant execute on function public.get_report_coverage_for_range(text) to authenticated;
revoke execute on function public.get_report_coverage_for_range(text) from public, anon;
