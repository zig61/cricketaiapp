-- skills / sub_skills / root_causes: fixed taxonomy structure.
-- Real rows (v1 seeds "Batting" -> "front_foot_drive") land in Milestones 07-08 content work.
-- docs/04-database.md §1; taxonomy detail in docs/08-coaching-engine.md §3.

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null
);

create table public.sub_skills (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills (id) on delete cascade,
  key text not null unique,
  name text not null
);

create table public.root_causes (
  id uuid primary key default gen_random_uuid(),
  sub_skill_id uuid not null references public.sub_skills (id) on delete cascade,
  key text not null unique,
  name text not null,
  -- Used in LLM prompt construction, per SR-COACH-005.
  description text not null
);

create index sub_skills_skill_id_idx on public.sub_skills (skill_id);
create index root_causes_sub_skill_id_idx on public.root_causes (sub_skill_id);
