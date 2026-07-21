alter table public.user_profiles add column if not exists display_name text;

update public.user_profiles
set display_name = name
where display_name is null and name is not null and btrim(name) <> '';

insert into public.user_profiles (id, display_name, preferences)
select id, null, '{}'::jsonb
from auth.users
on conflict (id) do nothing;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, preferences)
  values (new.id, null, '{}'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_user_profile_after_signup on auth.users;
create trigger create_user_profile_after_signup
after insert on auth.users
for each row execute procedure public.create_user_profile();

notify pgrst, 'reload schema';
