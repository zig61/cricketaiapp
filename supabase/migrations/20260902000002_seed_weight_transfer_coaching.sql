-- Seeds the coaching taxonomy for the second real marker, balance_weight_transfer
-- (docs/08-coaching-engine.md §3, §8 for weight_transfer_incomplete — already
-- named and drilled in the original docs, just not yet seeded; and a NEW
-- root cause, weight_transfer_overbalanced, introduced this pass — the
-- original docs' taxonomy only ever described "incomplete" transfer, never
-- an over-balance case, so this root cause and its drill are a genuine new
-- coaching-content judgment call, not sourced from anything, and should be
-- validated before being trusted in front of real players.

insert into public.root_causes (sub_skill_id, key, name, description)
select id, 'weight_transfer_incomplete', 'Incomplete weight transfer',
  'Weight doesn''t move convincingly onto the front foot through the shot, leaving the player on the back foot at contact.'
from public.sub_skills where key = 'front_foot_drive';

insert into public.root_causes (sub_skill_id, key, name, description)
select id, 'weight_transfer_overbalanced', 'Overbalanced onto the front foot',
  'Weight moves past the front foot before or at contact, past the point of balanced control.'
from public.sub_skills where key = 'front_foot_drive';

-- Step-and-Drive Drill, verbatim from docs/08-coaching-engine.md §8.
insert into public.drills (title, steps, difficulty_level)
values (
  'Step-and-Drive Drill',
  '["Set up a marked spot roughly where your front foot should land for a front-foot drive.", "Play the shot off a stationary ball, exaggerating the step onto the marked spot.", "Repeat until the weight-transfer habit feels natural.", "Remove the marker and play the same shot, keeping the same feeling of committing your weight forward."]'::jsonb,
  'beginner'
);

insert into public.drill_root_causes (drill_id, root_cause_id)
select d.id, rc.id
from public.drills d, public.root_causes rc
where d.title = 'Step-and-Drive Drill' and rc.key = 'weight_transfer_incomplete';

-- Hold the Finish Drill — proposed for this pass, not sourced from docs/08
-- (which has no drill for overbalancing). Flagged as a coaching-content
-- judgment call needing real validation.
insert into public.drills (title, steps, difficulty_level)
values (
  'Hold the Finish Drill',
  '["Play the shot at normal pace.", "At the end of the shot, hold your finishing position for a full 2 seconds.", "Check: is your back foot planted, or has it dragged forward to catch your balance?", "If you stumble or drag, it means weight moved past the front foot too fast — repeat with a touch less commitment forward until the finish holds clean."]'::jsonb,
  'intermediate'
);

insert into public.drill_root_causes (drill_id, root_cause_id)
select d.id, rc.id
from public.drills d, public.root_causes rc
where d.title = 'Hold the Finish Drill' and rc.key = 'weight_transfer_overbalanced';
