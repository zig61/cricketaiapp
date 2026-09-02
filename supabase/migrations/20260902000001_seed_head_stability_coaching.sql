-- Seeds the v1 single-marker slice of the coaching taxonomy (docs/08-coaching-engine.md
-- §1-2, §8) so diagnose/match_drill have something real to write against.
-- Only head_stability's root cause is seeded — the other five root causes
-- have no built marker to trigger them yet.

insert into public.skills (key, name)
values ('batting', 'Batting');

insert into public.sub_skills (skill_id, key, name)
select id, 'front_foot_drive', 'Front-foot drive'
from public.skills where key = 'batting';

insert into public.root_causes (sub_skill_id, key, name, description)
select id, 'head_falling_away', 'Head falling away',
  'Head drifts sideways away from the ball line between backlift and contact, instead of staying still and level.'
from public.sub_skills where key = 'front_foot_drive';

insert into public.drills (title, steps, difficulty_level)
values (
  'Wall Head-Still Drill',
  '["Stand close to a wall or mirror, bat in hand.", "Shadow-bat slowly, keeping your head still throughout the shot.", "Any head movement is immediately visible against the wall.", "3 sets of 10 slow-motion shots, resetting your stance each rep."]'::jsonb,
  'beginner'
);

insert into public.drill_root_causes (drill_id, root_cause_id)
select d.id, rc.id
from public.drills d, public.root_causes rc
where d.title = 'Wall Head-Still Drill' and rc.key = 'head_falling_away';
