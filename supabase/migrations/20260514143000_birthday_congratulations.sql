create table if not exists public.birthday_congratulations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  birthday_year integer not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, sender_id, birthday_year),
  constraint birthday_congratulations_year_check check (birthday_year between 2000 and 2200)
);

alter table public.birthday_congratulations enable row level security;

create policy "Birthday congratulations are visible to authenticated users"
  on public.birthday_congratulations
  for select
  to authenticated
  using (true);

create policy "Users can send one birthday congratulation"
  on public.birthday_congratulations
  for insert
  to authenticated
  with check (sender_id = auth.uid());

create index if not exists idx_birthday_congratulations_profile_year
  on public.birthday_congratulations(profile_id, birthday_year);
