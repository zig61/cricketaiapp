-- Extensions and shared helpers used by later migrations.

create extension if not exists pgcrypto;

-- Reusable trigger function to keep `updated_at` current on row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
