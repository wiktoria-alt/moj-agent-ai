-- Lekcja 05 / W2: aplikacja zapisuje historię bezpośrednio z przeglądarki
-- przy użyciu klucza anon. RLS zostanie skonfigurowany w późniejszej lekcji.

alter table public.conversations disable row level security;
alter table public.messages disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.conversations to anon, authenticated;
grant select, insert, update, delete on table public.messages to anon, authenticated;

notify pgrst, 'reload schema';
