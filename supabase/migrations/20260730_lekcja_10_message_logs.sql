create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  message text not null,
  blocked boolean not null default false,
  block_reason text
);

alter table public.message_logs enable row level security;

drop policy if exists "own message logs" on public.message_logs;
create policy "own message logs"
on public.message_logs
for insert
with check (user_id = auth.uid());

create index if not exists message_logs_user_created_at_idx
on public.message_logs(user_id, created_at desc);

create index if not exists message_logs_blocked_created_at_idx
on public.message_logs(blocked, created_at desc);
