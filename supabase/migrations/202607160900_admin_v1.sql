create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete restrict,
  email text not null,
  display_name text,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_by uuid,
  updated_by uuid,
  constraint admin_users_role_check check (role in ('owner', 'operation', 'support', 'finance', 'read_only')),
  constraint admin_users_email_not_empty check (length(trim(email)) > 3)
);

create unique index if not exists idx_admin_users_lower_email
  on public.admin_users (lower(email));

create unique index if not exists idx_admin_users_user_id
  on public.admin_users (user_id)
  where user_id is not null;

create index if not exists idx_admin_users_active_role
  on public.admin_users (active, role);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete restrict,
  admin_auth_user_id uuid,
  admin_email text,
  admin_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  next_value jsonb,
  reason text,
  result text not null default 'success',
  correlation_id text not null,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_result_check check (result in ('success', 'failed', 'denied'))
);

create index if not exists idx_admin_audit_log_entity
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

create index if not exists idx_admin_audit_log_admin
  on public.admin_audit_log (admin_user_id, created_at desc);

create index if not exists idx_admin_audit_log_correlation
  on public.admin_audit_log (correlation_id);

create table if not exists public.admin_customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  note text not null,
  active boolean not null default true,
  created_by uuid references public.admin_users(id) on delete restrict,
  updated_by uuid references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_customer_notes_note_not_empty check (length(trim(note)) > 0)
);

create index if not exists idx_admin_customer_notes_customer
  on public.admin_customer_notes (customer_id, active, created_at desc);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete restrict,
  constraint app_settings_key_not_empty check (length(trim(key)) > 0)
);

insert into public.app_settings (key, value, description)
values
  ('trial.enabled', 'true'::jsonb, 'Controla novas concessoes automaticas de degustacao. Beneficios ja concedidos permanecem validos.'),
  ('trial.photo_limit', '10'::jsonb, 'Quantidade de fotos da degustacao gratuita.'),
  ('admin.password_reset_redirect_origin', 'null'::jsonb, 'Origem HTTPS opcional para links de redefinicao de senha enviados pelo Admin.')
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists admin_status text not null default 'active',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists admin_updated_at timestamptz,
  add column if not exists admin_updated_by uuid references public.admin_users(id) on delete restrict;

alter table public.profiles
  add constraint profiles_admin_status_check
  check (admin_status in ('active', 'blocked', 'deactivated'));

create index if not exists idx_profiles_admin_status
  on public.profiles (admin_status, last_login_at desc);

alter table public.plans
  add column if not exists active boolean not null default true,
  add column if not exists visible boolean not null default true,
  add column if not exists available_for_purchase boolean not null default true,
  add column if not exists version integer not null default 1,
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_admin uuid references public.admin_users(id) on delete restrict,
  add column if not exists updated_by_admin uuid references public.admin_users(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_plans_admin_catalog
  on public.plans (active, visible, available_for_purchase);

alter table public.report_credit_plans
  add column if not exists payment_v1_plan_code text,
  add column if not exists visible boolean not null default true,
  add column if not exists available_for_purchase boolean not null default true,
  add column if not exists version integer not null default 1,
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by_admin uuid references public.admin_users(id) on delete restrict,
  add column if not exists updated_by_admin uuid references public.admin_users(id) on delete restrict;

create unique index if not exists idx_report_credit_plans_payment_v1_plan_code
  on public.report_credit_plans (payment_v1_plan_code)
  where payment_v1_plan_code is not null;

create index if not exists idx_report_credit_plans_admin_catalog
  on public.report_credit_plans (active, visible, available_for_purchase);

update public.report_credit_plans
set payment_v1_plan_code = case id
  when 'report_50_beta_4990' then 'report_50_beta'
  when 'report_100_9990' then 'report_100'
  when 'report_150_14990' then 'report_150'
  else payment_v1_plan_code
end
where id in ('report_50_beta_4990', 'report_100_9990', 'report_150_14990')
  and payment_v1_plan_code is null;

alter table public.payment_v1_orders
  add column if not exists admin_last_reprocessed_at timestamptz,
  add column if not exists admin_last_reprocess_result jsonb,
  add column if not exists admin_reprocess_count integer not null default 0,
  add column if not exists plan_snapshot jsonb;

alter table public.payment_v1_credits
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists revoked_by_admin uuid references public.admin_users(id) on delete restrict,
  add column if not exists manual_reason text,
  add column if not exists granted_by_admin uuid references public.admin_users(id) on delete restrict;

alter table public.report_credits
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists revoked_by_admin uuid references public.admin_users(id) on delete restrict,
  add column if not exists manual_reason text,
  add column if not exists granted_by_admin uuid references public.admin_users(id) on delete restrict;

create table if not exists public.admin_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  credit_table text not null,
  credit_id text,
  action text not null,
  amount integer not null,
  previous_balance integer not null,
  next_balance integer not null,
  reason text not null,
  admin_user_id uuid references public.admin_users(id) on delete restrict,
  audit_log_id uuid references public.admin_audit_log(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_credit_adjustments_table_check check (credit_table in ('entitlements', 'report_credits', 'payment_v1_credits')),
  constraint admin_credit_adjustments_action_check check (action in ('grant', 'remove')),
  constraint admin_credit_adjustments_reason_not_empty check (length(trim(reason)) > 0)
);

create index if not exists idx_admin_credit_adjustments_customer
  on public.admin_credit_adjustments (customer_id, created_at desc);

create or replace function public.set_admin_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_admin_updated_at();

create trigger admin_customer_notes_set_updated_at
  before update on public.admin_customer_notes
  for each row
  execute function public.set_admin_updated_at();

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row
  execute function public.set_admin_updated_at();

alter table public.admin_users enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_customer_notes enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_credit_adjustments enable row level security;
