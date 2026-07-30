create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  tokens_input integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  model text not null,
  endpoint text not null
);

alter table public.api_usage enable row level security;

drop policy if exists "own api usage" on public.api_usage;
create policy "own api usage"
on public.api_usage
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists api_usage_user_created_at_idx
on public.api_usage(user_id, created_at desc);
