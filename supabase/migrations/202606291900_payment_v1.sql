create extension if not exists pgcrypto;

create table if not exists public.payment_v1_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_code text not null,
  provider text not null default 'asaas',
  provider_checkout_id text,
  checkout_url text,
  external_reference text not null unique,
  status text not null default 'pending',
  amount_cents integer not null,
  analysis_limit integer not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_v1_orders_amount_positive check (amount_cents > 0),
  constraint payment_v1_orders_analysis_limit_positive check (analysis_limit > 0),
  constraint payment_v1_orders_provider_check check (provider = 'asaas'),
  constraint payment_v1_orders_status_check check (status in ('pending', 'paid', 'canceled', 'expired', 'refused', 'failed'))
);

create index if not exists idx_payment_v1_orders_checkout
  on public.payment_v1_orders(provider_checkout_id);

create index if not exists idx_payment_v1_orders_user_status
  on public.payment_v1_orders(user_id, status);

create index if not exists idx_payment_v1_orders_status
  on public.payment_v1_orders(status);

create table if not exists public.payment_v1_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  event_id text not null,
  event_type text,
  provider_checkout_id text,
  external_reference text,
  raw jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_v1_events_provider_check check (provider = 'asaas')
);

create unique index if not exists idx_payment_v1_events_provider_event_id
  on public.payment_v1_events(provider, event_id);

create table if not exists public.payment_v1_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_id uuid not null references public.payment_v1_orders(id),
  plan_code text not null,
  analysis_limit integer not null,
  analysis_used integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(order_id),
  constraint payment_v1_credits_analysis_limit_positive check (analysis_limit > 0),
  constraint payment_v1_credits_analysis_used_non_negative check (analysis_used >= 0),
  constraint payment_v1_credits_status_check check (status in ('active', 'finalized', 'revoked'))
);

create index if not exists idx_payment_v1_credits_user_status
  on public.payment_v1_credits(user_id, status);

create or replace function public.set_payment_v1_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payment_v1_orders_set_updated_at
  before update on public.payment_v1_orders
  for each row
  execute function public.set_payment_v1_orders_updated_at();

alter table public.payment_v1_orders enable row level security;
alter table public.payment_v1_events enable row level security;
alter table public.payment_v1_credits enable row level security;

create policy "payment v1 orders owner select" on public.payment_v1_orders
  for select to authenticated
  using (auth.uid() = user_id);

create policy "payment v1 credits owner select" on public.payment_v1_credits
  for select to authenticated
  using (auth.uid() = user_id);
