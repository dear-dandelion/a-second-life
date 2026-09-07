-- Canonical strings preserve the existing API and reporting contract.
-- Existing ambiguous values may be carried forward unchanged, never newly authored.
create or replace function public.normalize_health_quantity(value text, kind text)
returns text language plpgsql immutable set search_path=public as $$
declare s text := lower(regexp_replace(coalesce(value,''),'\s','','g')); m text[]; factor numeric:=1; unit text;
begin
 if s='' then return null; end if;
 if kind='weight' then
   m:=regexp_match(s,'^([0-9]+(?:\.[0-9]+)?)(kg|公斤|千克|斤|g|克)$'); unit:='kg';
   if m[2]='斤' then factor:=0.5; elsif m[2] in ('g','克') then factor:=0.001; end if;
 elsif kind='duration' then
   m:=regexp_match(s,'^([0-9]+(?:\.[0-9]+)?)(分钟|分|min|小时|h)$');unit:='分钟';
   if m[2] in ('小时','h') then factor:=60; end if;
 elsif kind='exerciseFrequency' then
   m:=regexp_match(s,'^([0-9]+)(次/周|次每周)$');unit:='次/周';
   if m is null then m:=regexp_match(s,'^(?:每周|本周)([0-9]+)次$'); end if;
 end if;
 if m is null then raise exception 'HEALTH_UNIT_INVALID: %',kind; end if;
 return trim_scale(round(m[1]::numeric*factor,6))::text||unit;
end;
$$;

create or replace function public.normalize_health_payload(payload jsonb, existing jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb:=payload; path text[]; spec text[]; value text; normalized text;
begin
 foreach spec slice 1 in array array[['weight','amount','weight'],['exercise','duration','duration'],['exercise','frequency','exerciseFrequency']] loop
   path:=spec[1:2];
   if result #> path is null then continue; end if;
   value:=result #>> path;
   begin
     normalized:=public.normalize_health_quantity(value,spec[3]);
     result:=jsonb_set(result,path,coalesce(to_jsonb(normalized),'null'::jsonb));
   exception when raise_exception then
     if (existing #> path) is distinct from (result #> path) then raise; end if;
   end;
 end loop;
 return result;
end;
$$;

alter function public.patch_health_record(date,integer,jsonb,text[]) rename to patch_health_record_before_units;
revoke all on function public.patch_health_record_before_units(date,integer,jsonb,text[]) from public,anon,authenticated;
create function public.patch_health_record(target_date date,expected_version integer,payload jsonb,categories text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous jsonb;
begin
 perform public.require_self_user();
 previous:=public.get_health_record(target_date)->'record';
 return public.patch_health_record_before_units(target_date,expected_version,public.normalize_health_payload(payload,previous),categories);
end;
$$;
revoke all on function public.patch_health_record(date,integer,jsonb,text[]) from public,anon;
grant execute on function public.patch_health_record(date,integer,jsonb,text[]) to authenticated;

alter function public.save_health_record(date,jsonb) rename to save_health_record_before_units;
revoke all on function public.save_health_record_before_units(date,jsonb) from public,anon,authenticated;
create function public.save_health_record(target_date date,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous jsonb;
begin
 perform public.require_self_user();
 previous:=public.get_health_record(target_date)->'record';
 return public.save_health_record_before_units(target_date,public.normalize_health_payload(payload,previous));
end;
$$;
revoke all on function public.save_health_record(date,jsonb) from public,anon;
grant execute on function public.save_health_record(date,jsonb) to authenticated;
revoke all on function public.normalize_health_payload(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.normalize_health_quantity(text,text) from public,anon,authenticated;
