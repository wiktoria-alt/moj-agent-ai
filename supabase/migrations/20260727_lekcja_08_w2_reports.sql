-- Lekcja 08 W2: zapis wygenerowanych raportow w Supabase.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "own reports" on public.reports;
create policy "own reports"
on public.reports
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists reports_user_id_created_at_idx
on public.reports(user_id, created_at desc);

grant select, insert, update, delete on table public.reports to authenticated;
