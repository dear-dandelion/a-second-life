-- All report facts are read within one stable statement snapshot.
create or replace function public.get_report_source_snapshot(target_range text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.require_self_user();
  coverage jsonb;
begin
  coverage := public.get_report_coverage_for_range(target_range);
  return jsonb_build_object(
    'coverage', coverage,
    'generatedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'records', coalesce((select jsonb_agg(
      (public.health_record_json(r.id) #- '{menstrual,date}' #- '{weight,date}')
      || jsonb_build_object('version', r.version) order by r.record_date
    ) from public.health_records r where r.user_id = uid
      and r.record_date between (coverage->>'startDate')::date and (coverage->>'endDate')::date), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_report_source_snapshot(text) from public, anon;
grant execute on function public.get_report_source_snapshot(text) to authenticated;
