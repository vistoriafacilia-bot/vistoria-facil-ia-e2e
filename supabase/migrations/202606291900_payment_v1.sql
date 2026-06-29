create extension if not exists pgcrypto;

create table if not exists public.payment_v1_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_v1_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  event_id text,
  event_type text,
  provider_checkout_id text,
  external_reference text,
  raw jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_payment_v1_events_provider_event_id
  on public.payment_v1_events(provider, event_id)
  where event_id is not null;

create table if not exists public.payment_v1_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  order_id uuid not null references public.payment_v1_orders(id),
  plan_code text not null,
  analysis_limit integer not null,
  analysis_used integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(order_id)
);

alter table public.payment_v1_orders enable row level security;
alter table public.payment_v1_events enable row level security;
alter table public.payment_v1_credits enable row level security;

create policy "payment v1 orders owner select" on public.payment_v1_orders
  for select to authenticated
  using (auth.uid() = user_id);

create policy "payment v1 credits owner select" on public.payment_v1_credits
  for select to authenticated
  using (auth.uid() = user_id);
