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
  result text not null default 'pending',
  correlation_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  constraint admin_audit_log_result_check check (result in ('pending', 'success', 'failed', 'denied'))
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
  credit_kind text not null,
  action text not null,
  usage_units integer not null,
  previous_usage_units integer not null,
  next_usage_units integer not null,
  reason text not null,
  admin_user_id uuid references public.admin_users(id) on delete restrict,
  audit_log_id uuid references public.admin_audit_log(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_credit_adjustments_table_check check (credit_table in ('entitlements', 'report_credits', 'payment_v1_credits')),
  constraint admin_credit_adjustments_kind_check check (credit_kind in ('photo_limit', 'report_credit')),
  constraint admin_credit_adjustments_action_check check (action in ('grant', 'remove')),
  constraint admin_credit_adjustments_usage_units_positive check (usage_units > 0),
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

alter table public.entitlements
  drop constraint if exists entitlements_plan_id_check;

alter table public.entitlements
  add constraint entitlements_plan_id_check
  check (plan_id in ('free_10', 'beta_paid_4990', 'admin_usage'));

create or replace function public.admin_bootstrap_owner(
  p_user_id uuid,
  p_email text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_users;
  v_owner public.admin_users;
  v_error_code text;
  v_error_message text;
begin
  select * into v_existing
  from public.admin_users
  where user_id = p_user_id or lower(email) = lower(trim(p_email))
  limit 1;

  if found then
    if v_existing.role = 'owner' and v_existing.active then
      return jsonb_build_object('success', true, 'adminUser', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('success', false, 'failureCode', 'bootstrap_identity_conflict');
  end if;

  if exists (select 1 from public.admin_users where role = 'owner') then
    return jsonb_build_object('success', false, 'failureCode', 'bootstrap_owner_already_persisted');
  end if;

  begin
    insert into public.admin_users (user_id, email, display_name, role, active)
    values (p_user_id, lower(trim(p_email)), nullif(trim(p_display_name), ''), 'owner', true)
    returning * into v_owner;

    insert into public.admin_audit_log (
      admin_user_id,
      admin_auth_user_id,
      admin_email,
      admin_role,
      action,
      entity_type,
      entity_id,
      previous_value,
      next_value,
      reason,
      result,
      correlation_id,
      completed_at
    ) values (
      v_owner.id,
      p_user_id,
      v_owner.email,
      'owner',
      'admin_users.bootstrap_owner',
      'admin_users',
      v_owner.id::text,
      null,
      to_jsonb(v_owner),
      'Initial owner bootstrap',
      'success',
      gen_random_uuid()::text,
      now()
    );

    return jsonb_build_object('success', true, 'adminUser', to_jsonb(v_owner));
  exception when others then
    get stacked diagnostics v_error_code = returned_sqlstate, v_error_message = message_text;
  end;

  insert into public.admin_audit_log (
    admin_auth_user_id,
    admin_email,
    admin_role,
    action,
    entity_type,
    entity_id,
    reason,
    result,
    correlation_id,
    completed_at,
    failure_code,
    next_value
  ) values (
    p_user_id,
    lower(trim(p_email)),
    'owner',
    'admin_users.bootstrap_owner',
    'admin_users',
    p_user_id::text,
    'Initial owner bootstrap',
    'failed',
    gen_random_uuid()::text,
    now(),
    v_error_code,
    jsonb_build_object('error', v_error_message)
  );

  return jsonb_build_object('success', false, 'failureCode', coalesce(v_error_code, 'bootstrap_failed'));
end;
$$;

create or replace function public.admin_adjust_usage_credit(
  p_customer_id uuid,
  p_action text,
  p_credit_table text,
  p_credit_id text,
  p_plan_id text,
  p_usage_units integer,
  p_reason text,
  p_admin_user_id uuid,
  p_admin_auth_user_id uuid,
  p_admin_email text,
  p_admin_role text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_credit public.payment_v1_credits;
  v_report_credit public.report_credits;
  v_entitlement public.entitlements;
  v_plan public.report_credit_plans;
  v_previous jsonb;
  v_next jsonb;
  v_entity_type text;
  v_entity_id text;
  v_credit_kind text;
  v_before_units integer := 0;
  v_after_units integer := 0;
  v_adjustment_units integer := 0;
  v_audit_id uuid;
  v_correlation_id text := coalesce(nullif(trim(p_correlation_id), ''), gen_random_uuid()::text);
  v_error_code text;
  v_error_message text;
begin
  begin
    if p_action not in ('grant', 'remove') then
      raise exception 'INVALID_USAGE_CREDIT_ACTION';
    end if;
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'USAGE_CREDIT_REASON_REQUIRED';
    end if;

    if p_action = 'grant' and p_credit_table = 'entitlements' then
      if coalesce(p_usage_units, 0) <= 0 then
        raise exception 'PHOTO_LIMIT_MUST_BE_POSITIVE';
      end if;

      select coalesce(max(max_photos_per_inspection), 0) into v_before_units
      from public.entitlements
      where user_id = p_customer_id and status = 'active';

      if p_usage_units <= v_before_units then
        raise exception 'PHOTO_LIMIT_MUST_INCREASE';
      end if;

      v_after_units := greatest(v_before_units, p_usage_units);
      insert into public.entitlements (
        id, user_id, plan_id, status, source, max_photos_per_inspection, pdf_enabled, created_at, updated_at
      ) values (
        'admin-usage-' || gen_random_uuid()::text,
        p_customer_id,
        'admin_usage',
        'active',
        'manual_admin',
        v_after_units,
        true,
        now(),
        now()
      ) returning * into v_entitlement;

      v_entity_type := 'entitlements';
      v_entity_id := v_entitlement.id;
      v_credit_kind := 'photo_limit';
      v_adjustment_units := v_after_units - v_before_units;
      v_previous := jsonb_build_object('effective_photo_limit', v_before_units);
      v_next := to_jsonb(v_entitlement);
    elsif p_action = 'grant' and p_credit_table = 'report_credits' then
      select * into v_plan
      from public.report_credit_plans
      where id = p_plan_id and active = true
      for share;
      if not found then
        raise exception 'REPORT_PLAN_NOT_AVAILABLE';
      end if;

      select count(*)::integer into v_before_units
      from public.report_credits
      where user_id = p_customer_id and status = 'available';

      insert into public.report_credits (
        id, user_id, plan_id, payment_id, status, analysis_limit, analysis_used, price_cents, currency,
        manual_reason, granted_by_admin, created_at, updated_at
      ) values (
        'admin-report-' || gen_random_uuid()::text,
        p_customer_id,
        v_plan.id,
        'admin-grant-' || gen_random_uuid()::text,
        'available',
        v_plan.analysis_limit,
        0,
        0,
        v_plan.currency,
        trim(p_reason),
        p_admin_user_id,
        now(),
        now()
      ) returning * into v_report_credit;

      v_after_units := v_before_units + 1;
      v_adjustment_units := 1;
      v_entity_type := 'report_credits';
      v_entity_id := v_report_credit.id;
      v_credit_kind := 'report_credit';
      v_previous := jsonb_build_object('available_report_credits', v_before_units);
      v_next := to_jsonb(v_report_credit);
    elsif p_action = 'remove' and p_credit_table = 'payment_v1_credits' then
      select * into v_payment_credit
      from public.payment_v1_credits
      where id = p_credit_id::uuid and user_id = p_customer_id and status = 'active'
      for update;
      if not found then
        raise exception 'PAYMENT_USAGE_CREDIT_NOT_ACTIVE';
      end if;

      v_before_units := greatest(v_payment_credit.analysis_limit - v_payment_credit.analysis_used, 0);
      update public.payment_v1_credits
      set status = 'revoked',
          revoked_at = now(),
          revoked_reason = trim(p_reason),
          revoked_by_admin = p_admin_user_id
      where id = v_payment_credit.id
      returning * into v_payment_credit;

      v_after_units := 0;
      v_adjustment_units := v_before_units;
      v_entity_type := 'payment_v1_credits';
      v_entity_id := v_payment_credit.id::text;
      v_credit_kind := 'photo_limit';
      v_previous := jsonb_build_object('remaining_photo_units', v_before_units);
      v_next := to_jsonb(v_payment_credit);
    elsif p_action = 'remove' and p_credit_table = 'report_credits' then
      select * into v_report_credit
      from public.report_credits
      where id = p_credit_id and user_id = p_customer_id and status = 'available'
      for update;
      if not found then
        raise exception 'REPORT_USAGE_CREDIT_NOT_AVAILABLE';
      end if;

      v_before_units := 1;
      update public.report_credits
      set status = 'canceled',
          revoked_at = now(),
          revoked_reason = trim(p_reason),
          revoked_by_admin = p_admin_user_id,
          updated_at = now()
      where id = v_report_credit.id
      returning * into v_report_credit;

      v_after_units := 0;
      v_adjustment_units := 1;
      v_entity_type := 'report_credits';
      v_entity_id := v_report_credit.id;
      v_credit_kind := 'report_credit';
      v_previous := jsonb_build_object('available_report_credits', v_before_units);
      v_next := to_jsonb(v_report_credit);
    elsif p_action = 'remove' and p_credit_table = 'entitlements' then
      select * into v_entitlement
      from public.entitlements
      where id = p_credit_id and user_id = p_customer_id and status = 'active' and plan_id = 'admin_usage'
      for update;
      if not found then
        raise exception 'MANUAL_PHOTO_LIMIT_NOT_ACTIVE';
      end if;

      v_before_units := v_entitlement.max_photos_per_inspection;
      update public.entitlements
      set status = 'expired', updated_at = now()
      where id = v_entitlement.id
      returning * into v_entitlement;

      select coalesce(max(max_photos_per_inspection), 0) into v_after_units
      from public.entitlements
      where user_id = p_customer_id and status = 'active';

      v_adjustment_units := v_before_units;
      v_entity_type := 'entitlements';
      v_entity_id := v_entitlement.id;
      v_credit_kind := 'photo_limit';
      v_previous := jsonb_build_object('effective_photo_limit', v_before_units);
      v_next := to_jsonb(v_entitlement);
    else
      raise exception 'INVALID_USAGE_CREDIT_TARGET';
    end if;

    insert into public.admin_audit_log (
      admin_user_id, admin_auth_user_id, admin_email, admin_role, action, entity_type, entity_id,
      previous_value, next_value, reason, result, correlation_id, completed_at
    ) values (
      p_admin_user_id, p_admin_auth_user_id, p_admin_email, p_admin_role, 'credits.' || p_action,
      v_entity_type, v_entity_id, v_previous, v_next, trim(p_reason), 'success', v_correlation_id, now()
    ) returning id into v_audit_id;

    insert into public.admin_credit_adjustments (
      customer_id, credit_table, credit_id, credit_kind, action, usage_units,
      previous_usage_units, next_usage_units, reason, admin_user_id, audit_log_id
    ) values (
      p_customer_id, v_entity_type, v_entity_id, v_credit_kind, p_action, greatest(v_adjustment_units, 1),
      v_before_units, v_after_units, trim(p_reason), p_admin_user_id, v_audit_id
    );

    return jsonb_build_object(
      'success', true,
      'entity', v_next,
      'adjustment', jsonb_build_object(
        'creditTable', v_entity_type,
        'creditId', v_entity_id,
        'creditKind', v_credit_kind,
        'action', p_action,
        'usageUnits', greatest(v_adjustment_units, 1),
        'previousUsageUnits', v_before_units,
        'nextUsageUnits', v_after_units,
        'auditLogId', v_audit_id
      )
    );
  exception when others then
    get stacked diagnostics v_error_code = returned_sqlstate, v_error_message = message_text;
  end;

  insert into public.admin_audit_log (
    admin_user_id, admin_auth_user_id, admin_email, admin_role, action, entity_type, entity_id,
    next_value, reason, result, correlation_id, completed_at, failure_code
  ) values (
    p_admin_user_id, p_admin_auth_user_id, p_admin_email, p_admin_role, 'credits.' || coalesce(p_action, 'unknown'),
    coalesce(p_credit_table, 'unknown'), nullif(p_credit_id, ''),
    jsonb_build_object('error', v_error_message), coalesce(nullif(trim(p_reason), ''), 'Missing reason'),
    'failed', v_correlation_id, now(), v_error_code
  );

  return jsonb_build_object('success', false, 'failureCode', coalesce(v_error_code, 'usage_credit_adjustment_failed'));
end;
$$;

revoke all on function public.admin_bootstrap_owner(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_adjust_usage_credit(uuid, text, text, text, text, integer, text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_owner(uuid, text, text) to service_role;
grant execute on function public.admin_adjust_usage_credit(uuid, text, text, text, text, integer, text, uuid, uuid, text, text, text) to service_role;

alter table public.admin_users enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_customer_notes enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_credit_adjustments enable row level security;
