alter table public.profiles
  add column if not exists height_cm integer check (height_cm between 80 and 250),
  add column if not exists menopausal_status text not null default '',
  add column if not exists allergy_history text not null default '',
  add column if not exists regular_medications text not null default '',
  add column if not exists pregnancy_history text not null default '',
  add column if not exists family_history text not null default '',
  add column if not exists screening_history text not null default '';

comment on column public.profiles.height_cm is 'Static height used for medical-report context';
comment on column public.profiles.menopausal_status is '未绝经、围绝经期、绝经后或不确定';
