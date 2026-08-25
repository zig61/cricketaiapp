-- drills / drill_root_causes / drill_prescriptions / drill_completions
-- (docs/04-database.md §1-2, SR-COACH-006, SR-DRILL-*)
--
-- drills and drill_root_causes are catalogue/reference data — not owned by any player,
-- not cascade-deleted by player actions.

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  steps jsonb not null,
  equipment text,
  difficulty_level text not null check (difficulty_level in ('beginner', 'intermediate', 'advanced')),
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger drills_set_updated_at
  before update on public.drills
  for each row
  execute function public.set_updated_at();

create table public.drill_root_causes (
  drill_id uuid not null references public.drills (id) on delete cascade,
  root_cause_id uuid not null references public.root_causes (id) on delete cascade,
  primary key (drill_id, root_cause_id)
);

create index drill_root_causes_root_cause_id_idx on public.drill_root_causes (root_cause_id);

create table public.drill_prescriptions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null unique references public.issues (id) on delete cascade,
  drill_id uuid not null references public.drills (id),
  prescribed_at timestamptz not null default now()
);

create table public.drill_completions (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null unique references public.drill_prescriptions (id) on delete cascade,
  completed_at timestamptz not null default now()
);
