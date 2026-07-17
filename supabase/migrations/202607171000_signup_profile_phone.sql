alter table public.profiles
  add column if not exists phone text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_phone_brazil_mobile_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_phone_brazil_mobile_check
      check (phone is null or phone ~ '^[1-9][0-9]9[0-9]{8}$');
  end if;
end $$;

comment on column public.profiles.phone is 'Brazilian mobile phone normalized to 11 digits, nullable for pre-existing customers.';
