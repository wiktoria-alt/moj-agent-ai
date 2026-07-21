-- Lekcja 05 / W3: tymczasowa identyfikacja użytkownika bez logowania.
-- RLS zostanie zastąpiony politykami powiązanymi z auth.uid() w lekcji 07.

alter table public.user_profiles disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
on table public.user_profiles
to anon, authenticated;

notify pgrst, 'reload schema';
