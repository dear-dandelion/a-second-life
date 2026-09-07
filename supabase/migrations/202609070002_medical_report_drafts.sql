-- A medical report is an isolated, immutable-at-source working copy. Its
-- snapshot and user edits must never update profiles or health records.
create table public.medical_report_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  range text not null check (range in ('1_month', '3_months', '6_months')),
  snapshot jsonb not null,
  overrides jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medical_report_drafts_user_updated_idx on public.medical_report_drafts(user_id, updated_at desc);
create trigger medical_report_drafts_set_updated_at before update on public.medical_report_drafts
for each row execute function public.set_updated_at();

alter table public.medical_report_drafts enable row level security;
create policy medical_report_drafts_own on public.medical_report_drafts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.medical_report_drafts to authenticated;
revoke all on public.medical_report_drafts from anon;
