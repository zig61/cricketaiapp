-- RLS isolation tests (pgTAP). NOT executed in the scaffolding environment
-- (no Docker/Supabase CLI there) — run via `supabase test db` once a real
-- local/linked project exists. Requires the `pgtap` and
-- `supabase_test_helpers` extensions, which `supabase test db` installs
-- automatically in a fresh local database.
--
-- Covers the Phase 17 list: own-profile access, cross-user isolation on
-- videos/issues/ai-coach data, and storage isolation.

begin;
select plan(12);

-- Two independent players.
select tests.create_supabase_user('player_a@example.com');
select tests.create_supabase_user('player_b@example.com');

-- ---------------------------------------------------------------------
-- profiles: auto-created by the on_auth_user_created trigger, own-only access
-- ---------------------------------------------------------------------
select tests.authenticate_as('player_a@example.com');

select is(
  (select count(*) from public.profiles)::int,
  1,
  'Player A sees exactly one profile row: their own (auto-created on signup)'
);

select isnt_empty(
  format('select 1 from public.profiles where id = %L', tests.get_supabase_uid('player_a@example.com')),
  'Player A can see their own profile row'
);

select is_empty(
  format('select 1 from public.profiles where id = %L', tests.get_supabase_uid('player_b@example.com')),
  'Player A cannot see player B''s profile row'
);

update public.profiles set display_name = 'Player A Updated' where id = auth.uid();
select is(
  (select display_name from public.profiles where id = auth.uid()),
  'Player A Updated',
  'Player A can update their own profile'
);

-- ---------------------------------------------------------------------
-- videos: own-only select/insert
-- ---------------------------------------------------------------------
insert into public.videos (player_id, kind) values (auth.uid(), 'initial');
select is(
  (select count(*) from public.videos where player_id = auth.uid())::int,
  1,
  'Player A can insert and then see their own video'
);

select throws_ok(
  format(
    'insert into public.videos (player_id, kind) values (%L, %L)',
    tests.get_supabase_uid('player_b@example.com'), 'initial'
  ),
  'new row violates row-level security policy for table "videos"',
  'Player A cannot insert a video on behalf of player B'
);

-- Switch to player B and confirm they cannot see player A's video.
select tests.authenticate_as('player_b@example.com');

select is(
  (select count(*) from public.videos)::int,
  0,
  'Player B sees zero videos — player A''s video is invisible to them'
);

-- ---------------------------------------------------------------------
-- issues / measurements / analyses: no client writes at all, even to own data
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.analyses (video_id, measurement_formula_version) values (gen_random_uuid(), '1')$$,
  'new row violates row-level security policy for table "analyses"',
  'No client, including the row owner, can insert directly into analyses'
);

-- ---------------------------------------------------------------------
-- ai_coach_conversations / ai_coach_messages: read-only isolation
-- ---------------------------------------------------------------------
select tests.authenticate_as(null); -- service role, bypasses RLS, to seed fixture data
insert into public.ai_coach_conversations (id, player_id)
  values ('11111111-1111-1111-1111-111111111111', tests.get_supabase_uid('player_a@example.com'));

select tests.authenticate_as('player_a@example.com');
select isnt_empty(
  'select 1 from public.ai_coach_conversations where id = ''11111111-1111-1111-1111-111111111111''',
  'Player A can see their own AI coach conversation'
);

select tests.authenticate_as('player_b@example.com');
select is_empty(
  'select 1 from public.ai_coach_conversations where id = ''11111111-1111-1111-1111-111111111111''',
  'Player B cannot see player A''s AI coach conversation'
);

-- ---------------------------------------------------------------------
-- storage.objects: path-prefix isolation on the player-videos bucket
-- ---------------------------------------------------------------------
select tests.authenticate_as('player_a@example.com');
select lives_ok(
  format(
    $$insert into storage.objects (bucket_id, name, owner) values ('player-videos', %L, auth.uid())$$,
    tests.get_supabase_uid('player_a@example.com') || '/test-video/original.mp4'
  ),
  'Player A can create a storage object under their own uid-prefixed path'
);

select throws_ok(
  format(
    $$insert into storage.objects (bucket_id, name, owner) values ('player-videos', %L, auth.uid())$$,
    tests.get_supabase_uid('player_b@example.com') || '/test-video/original.mp4'
  ),
  'new row violates row-level security policy',
  'Player A cannot create a storage object under player B''s uid-prefixed path'
);

select * from finish();
rollback;
