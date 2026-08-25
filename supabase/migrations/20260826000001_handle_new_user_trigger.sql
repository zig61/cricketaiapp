-- Auto-create a profiles row when a new Supabase Auth user signs up.
-- Gap found in audit: without this, a freshly authenticated user has no
-- public.profiles row, and every RLS-protected query that joins through
-- profiles/owns_video returns nothing until one exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
