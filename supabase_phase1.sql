-- SalesIntelligence Supabase Phase 1
-- Magic Link auth + session history persistence

create table if not exists public.call_sessions (
  id bigserial primary key,
  user_id uuid not null,
  session_id text not null,
  lead_id text,
  lead_name text,
  archived_at timestamptz default now(),
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, session_id)
);

create index if not exists idx_call_sessions_user_archived
  on public.call_sessions (user_id, archived_at desc);

alter table public.call_sessions enable row level security;

do $$ begin
  create policy "call_sessions_select_own"
  on public.call_sessions
  for select
  using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "call_sessions_insert_own"
  on public.call_sessions
  for insert
  with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "call_sessions_update_own"
  on public.call_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.touch_updated_at_call_sessions()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_call_sessions on public.call_sessions;
create trigger trg_touch_updated_at_call_sessions
before update on public.call_sessions
for each row execute function public.touch_updated_at_call_sessions();
