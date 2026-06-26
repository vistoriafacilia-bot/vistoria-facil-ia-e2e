-- VF Supabase foundation.
-- Run this in the Supabase SQL Editor for project vistoria-facil-ia-v0.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Vistoriador',
  email text,
  plan text not null default 'gratuito',
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists public.properties (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  property_type text not null check (property_type in ('apartamento', 'casa', 'sala comercial', 'outro')),
  address jsonb not null,
  general_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  inspection_type text not null check (inspection_type in ('entrada', 'saida')),
  status text not null check (status in ('rascunho', 'em_andamento', 'concluida', 'pdf_gerado')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  pdf_url text,
  summary text,
  app_version text not null
);

create table if not exists public.rooms (
  id text primary key,
  inspection_id text not null references public.inspections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id text primary key,
  inspection_id text not null references public.inspections(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_name text,
  url text not null,
  image_url text,
  storage_path text,
  caption text not null,
  display_title text,
  description text,
  ai_analysis jsonb,
  reviewed_status text not null default 'pendente',
  upload_status text,
  analysis_status text,
  review_status text,
  condition_suggested text,
  item_observed text,
  description_suggested text,
  fallback_applied boolean not null default false,
  analysis_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.reports (
  id text primary key,
  inspection_id text not null references public.inspections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  pdf_url text not null,
  storage_path text not null,
  filename text not null,
  general_summary text,
  generated_at timestamptz not null default now(),
  app_version text not null
);

create table if not exists public.entitlements (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('free_10', 'beta_paid_4990')),
  status text not null check (status in ('active', 'pending', 'expired')),
  source text not null check (source in ('free_self_service', 'mercado_pago', 'manual_admin')),
  max_photos_per_inspection integer not null,
  pdf_enabled boolean not null default false,
  order_id text,
  payment_id text,
  preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.plans (
  id text primary key,
  name text not null,
  description text not null,
  price_cents integer not null,
  currency text not null default 'BRL',
  max_photos_per_inspection integer not null,
  pdf_enabled boolean not null,
  payment_required boolean not null,
  badge text not null
);

create table if not exists public.events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now(),
  metadata jsonb
);

insert into public.plans (
  id, name, description, price_cents, currency, max_photos_per_inspection, pdf_enabled, payment_required, badge
) values
  ('free_10', 'Gratuito', 'Teste inicial com ate 10 fotos por vistoria.', 0, 'BRL', 10, true, false, 'Gratis'),
  ('beta_paid_4990', 'Beta Pago', 'Vistoria ampliada com pagamento integrado e relatorio PDF.', 4990, 'BRL', 50, true, true, 'R$ 49,90')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  max_photos_per_inspection = excluded.max_photos_per_inspection,
  pdf_enabled = excluded.pdf_enabled,
  payment_required = excluded.payment_required,
  badge = excluded.badge;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.inspections enable row level security;
alter table public.rooms enable row level security;
alter table public.photos enable row level security;
alter table public.reports enable row level security;
alter table public.entitlements enable row level security;
alter table public.events enable row level security;
alter table public.plans enable row level security;

create policy "profiles owner select" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles owner upsert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles owner update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "properties owner all" on public.properties
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "inspections owner all" on public.inspections
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "rooms owner all" on public.rooms
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "photos owner all" on public.photos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reports owner all" on public.reports
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "entitlements owner select" on public.entitlements
  for select to authenticated using (user_id = auth.uid());

create policy "entitlements controlled free insert" on public.entitlements
  for insert to authenticated with check (
    user_id = auth.uid()
    and plan_id = 'free_10'
    and status = 'active'
    and source = 'free_self_service'
    and max_photos_per_inspection <= 10
    and pdf_enabled = true
  );

create policy "entitlements controlled free update" on public.entitlements
  for update to authenticated using (
    user_id = auth.uid()
    and plan_id = 'free_10'
    and source = 'free_self_service'
  ) with check (
    user_id = auth.uid()
    and plan_id = 'free_10'
    and status = 'active'
    and source = 'free_self_service'
    and max_photos_per_inspection <= 10
    and pdf_enabled = true
  );

create policy "events owner insert" on public.events
  for insert to authenticated with check (user_id = auth.uid());
create policy "events owner select" on public.events
  for select to authenticated using (user_id = auth.uid());

create policy "plans readable" on public.plans
  for select to anon, authenticated using (true);

create index if not exists idx_properties_user_id on public.properties(user_id);
create index if not exists idx_inspections_user_property on public.inspections(user_id, property_id);
create index if not exists idx_rooms_inspection on public.rooms(inspection_id);
create index if not exists idx_photos_inspection on public.photos(inspection_id);
create index if not exists idx_reports_inspection on public.reports(inspection_id);
create index if not exists idx_entitlements_user on public.entitlements(user_id);
create index if not exists idx_events_user on public.events(user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-photos',
  'inspection-photos',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "inspection photos owner select" on storage.objects
  for select to authenticated using (
    bucket_id = 'inspection-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "inspection photos owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'inspection-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "inspection photos owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'inspection-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  ) with check (
    bucket_id = 'inspection-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "inspection photos owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'inspection-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
