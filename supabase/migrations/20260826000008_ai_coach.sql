-- Schema only, this pass — no chat endpoint/UI is built yet (no Anthropic key
-- wired, out of scope per the current build phase). This sets up the shape so
-- that work is additive later: retrieval-based context assembly (player
-- profile, recent analyses/issues, goals) reads from tables that already
-- exist and are already indexed by player_id; nothing here needs to change
-- for that to work.

create table public.ai_coach_conversations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_coach_conversations_player_id_idx on public.ai_coach_conversations (player_id);

create trigger ai_coach_conversations_set_updated_at
  before update on public.ai_coach_conversations
  for each row
  execute function public.set_updated_at();

create table public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_coach_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index ai_coach_messages_conversation_id_idx on public.ai_coach_messages (conversation_id);

alter table public.ai_coach_conversations enable row level security;
alter table public.ai_coach_messages enable row level security;

-- Read-only for clients on both tables. Sending a message is an action with a
-- side effect (an LLM call) once that endpoint exists, not a plain client
-- write — mirrors how analyses/issues are service-role-write-only.
create policy "players can view own ai coach conversations"
  on public.ai_coach_conversations for select
  using (player_id = auth.uid());

create policy "players can view own ai coach messages"
  on public.ai_coach_messages for select
  using (
    exists (
      select 1 from public.ai_coach_conversations
      where ai_coach_conversations.id = ai_coach_messages.conversation_id
        and ai_coach_conversations.player_id = auth.uid()
    )
  );
