alter table public.inspections
  drop constraint if exists inspections_status_check;

alter table public.inspections
  add constraint inspections_status_check
  check (status in ('rascunho', 'em_andamento', 'concluida', 'pdf_gerado', 'finalizado'));

create table if not exists public.report_credit_plans (
  id text primary key,
  name text not null,
  description text not null,
  price_cents integer not null,
  regular_price_cents integer,
  currency text not null default 'BRL',
  analysis_limit integer not null,
  badge text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_payment_orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.report_credit_plans(id),
  status text not null check (status in ('created', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back', 'error')),
  amount_cents integer not null,
  currency text not null default 'BRL',
  preference_id text,
  checkout_url text,
  payment_id text,
  provider text not null default 'mercado_pago',
  raw_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_credits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.report_credit_plans(id),
  order_id text references public.report_payment_orders(id),
  payment_id text,
  preference_id text,
  inspection_id text references public.inspections(id) on delete restrict,
  status text not null check (status in ('available', 'assigned', 'in_progress', 'finalized', 'canceled', 'refunded')),
  analysis_limit integer not null,
  analysis_used integer not null default 0,
  price_cents integer not null,
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_at timestamptz,
  finalized_at timestamptz,
  unique(payment_id)
);

create table if not exists public.mercadopago_webhook_events (
  id text primary key,
  event_type text,
  payment_id text,
  status text,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  payload jsonb
);

insert into public.report_credit_plans (
  id, name, description, price_cents, regular_price_cents, currency, analysis_limit, badge
) values
  ('report_50_beta_4990', 'Relatorio 50', 'Credito avulso para 1 relatorio com ate 50 analises de IA. Preco promocional de beta.', 4990, 6990, 'BRL', 50, 'Beta R$ 49,90'),
  ('report_100_9990', 'Relatorio 100', 'Credito avulso para 1 relatorio com ate 100 analises de IA.', 9990, null, 'BRL', 100, 'R$ 99,90'),
  ('report_150_14990', 'Relatorio 150', 'Credito avulso para 1 relatorio com ate 150 analises de IA.', 14990, null, 'BRL', 150, 'R$ 149,90')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  regular_price_cents = excluded.regular_price_cents,
  currency = excluded.currency,
  analysis_limit = excluded.analysis_limit,
  badge = excluded.badge,
  active = true,
  updated_at = now();

alter table public.report_credit_plans enable row level security;
alter table public.report_payment_orders enable row level security;
alter table public.report_credits enable row level security;
alter table public.mercadopago_webhook_events enable row level security;

create policy "report credit plans readable" on public.report_credit_plans
  for select to anon, authenticated using (active = true);

create policy "report payment orders owner select" on public.report_payment_orders
  for select to authenticated using (user_id = auth.uid());

create policy "report credits owner select" on public.report_credits
  for select to authenticated using (user_id = auth.uid());

create index if not exists idx_report_payment_orders_user on public.report_payment_orders(user_id);
create index if not exists idx_report_payment_orders_preference on public.report_payment_orders(preference_id);
create index if not exists idx_report_payment_orders_payment on public.report_payment_orders(payment_id);
create index if not exists idx_report_credits_user_status on public.report_credits(user_id, status);
create index if not exists idx_report_credits_inspection on public.report_credits(inspection_id);

create or replace function public.assign_report_credit(p_credit_id text, p_inspection_id text)
returns public.report_credits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.report_credits;
  v_inspection public.inspections;
begin
  select * into v_credit
  from public.report_credits
  where id = p_credit_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'REPORT_CREDIT_NOT_FOUND';
  end if;

  if v_credit.status not in ('available', 'assigned', 'in_progress') then
    raise exception 'REPORT_CREDIT_NOT_AVAILABLE';
  end if;

  if v_credit.inspection_id is not null and v_credit.inspection_id <> p_inspection_id then
    raise exception 'REPORT_CREDIT_ALREADY_ASSIGNED';
  end if;

  select * into v_inspection
  from public.inspections
  where id = p_inspection_id
    and user_id = auth.uid();

  if not found then
    raise exception 'INSPECTION_NOT_FOUND';
  end if;

  if v_inspection.status in ('pdf_gerado', 'finalizado') then
    raise exception 'INSPECTION_ALREADY_FINALIZED';
  end if;

  update public.report_credits
  set inspection_id = p_inspection_id,
      status = case when analysis_used > 0 then 'in_progress' else 'assigned' end,
      assigned_at = coalesce(assigned_at, now()),
      updated_at = now()
  where id = p_credit_id
  returning * into v_credit;

  return v_credit;
end;
$$;

create or replace function public.consume_report_credit_analysis(p_inspection_id text)
returns public.report_credits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.report_credits;
begin
  select * into v_credit
  from public.report_credits
  where inspection_id = p_inspection_id
    and user_id = auth.uid()
    and status in ('assigned', 'in_progress')
  order by assigned_at asc nulls last, created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'REPORT_CREDIT_NOT_ASSIGNED';
  end if;

  if v_credit.analysis_used >= v_credit.analysis_limit then
    raise exception 'REPORT_CREDIT_LIMIT_REACHED';
  end if;

  update public.report_credits
  set analysis_used = analysis_used + 1,
      status = 'in_progress',
      updated_at = now()
  where id = v_credit.id
  returning * into v_credit;

  return v_credit;
end;
$$;

create or replace function public.finalize_report_credit(p_inspection_id text)
returns public.report_credits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.report_credits;
begin
  select * into v_credit
  from public.report_credits
  where inspection_id = p_inspection_id
    and user_id = auth.uid()
    and status in ('assigned', 'in_progress')
  order by assigned_at asc nulls last, created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'REPORT_CREDIT_NOT_ASSIGNED';
  end if;

  update public.report_credits
  set status = 'finalized',
      finalized_at = now(),
      updated_at = now()
  where id = v_credit.id
  returning * into v_credit;

  return v_credit;
end;
$$;

grant execute on function public.assign_report_credit(text, text) to authenticated;
grant execute on function public.consume_report_credit_analysis(text) to authenticated;
grant execute on function public.finalize_report_credit(text) to authenticated;
