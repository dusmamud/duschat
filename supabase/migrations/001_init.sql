-- Dus Chat — 001_init.sql
-- Run this in the Supabase Dashboard: SQL Editor > New query > paste > Run.
-- Project: mairakhtk's Project (ref fpaixuxwskcbtulhtjrl, org Duschat)
-- Idempotent-ish: safe to re-run. It uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- / CREATE OR REPLACE so a second run does not fail on objects it created.
-- NOTE: this is the ONLY backend Dus Chat has. Security lives in RLS below —
-- the anon key in the frontend is public by design; never put the
-- service_role key in the app, in git, or in Cloudflare env vars.

-- ---------------------------------------------------------------------------
-- 1. profiles — one row per auth user. username is the login handle.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  -- Usernames are stored lowercase so login lookup is case-insensitive,
  -- and are at least 3 characters (matches the app's Zod validation).
  constraint profiles_username_lowercase check (username = lower(username)),
  constraint profiles_username_min_length check (char_length(username) >= 3),
  constraint profiles_name_not_empty check (char_length(trim(name)) > 0)
);

comment on table public.profiles is 'Dus Chat users. Max 2 rows — enforced by the enforce_two_users trigger.';
comment on column public.profiles.username is 'Unique login handle, always lowercase, min 3 chars.';

-- ---------------------------------------------------------------------------
-- 2. messages — every chat message. One shared room for the 2 users.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'text'
    check (type in ('text', 'code', 'image', 'file')),
  content text not null default '',
  -- file_url stores the Supabase Storage PATH inside the chat-files bucket
  -- (e.g. "<user-id>/<uuid>-notes.txt"), NOT a public URL — the bucket is
  -- private, so the app creates short-lived signed URLs to view/download.
  file_url text,
  file_name text,
  file_size int check (file_size is null or file_size >= 0),
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.messages is 'All Dus Chat messages (single shared room, 2 users).';
comment on column public.messages.reply_to is 'Message being replied to; null when the reply is deleted.';

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.messages enable row level security;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- messages
drop policy if exists "messages_select_authenticated" on public.messages;
create policy "messages_select_authenticated" on public.messages
  for select to authenticated using (true);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (sender_id = auth.uid());

-- A user may delete only their own messages through the table directly.
-- "Delete all chats" does NOT use this policy: it calls the SECURITY DEFINER
-- function delete_all_messages(), which bypasses RLS by design.
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- No UPDATE policy on messages: messages are never edited.

-- ---------------------------------------------------------------------------
-- 4. Storage bucket chat-files (private) + storage RLS
--    Images and .txt files only, 10 MB max per file.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: any signed-in user may read / upload / delete files in this
-- bucket. Files are namespaced per user (<user-id>/...) by the app, and the
-- bucket is private, so nothing is reachable without a signed URL.
drop policy if exists "chat_files_select_authenticated" on storage.objects;
create policy "chat_files_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'chat-files');

drop policy if exists "chat_files_insert_authenticated" on storage.objects;
create policy "chat_files_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-files');

drop policy if exists "chat_files_delete_authenticated" on storage.objects;
create policy "chat_files_delete_authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-files');

-- ---------------------------------------------------------------------------
-- 5. get_email_by_username — lets the app log in with a username.
--    Supabase Auth only signs in with email, so the app resolves
--    username -> email first. SECURITY DEFINER so anon callers can read
--    just the email for the username they typed (and nothing else).
-- ---------------------------------------------------------------------------
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles
  where username = lower(trim(p_username))
  limit 1;
$$;

comment on function public.get_email_by_username(text) is
  'Resolve a login username to its email for signInWithPassword. Returns null when unknown.';

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- registration_open — lets the app check the 2-user cap BEFORE creating an
-- auth user. Without this, a rejected 3rd signup would leave an orphaned
-- auth user (no profile row) whose email could never sign up again.
create or replace function public.registration_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 2 from public.profiles;
$$;

comment on function public.registration_open() is
  'True while fewer than 2 profiles exist. Checked by signUpWithUsername before auth.signUp.';

grant execute on function public.registration_open() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. delete_all_messages — one-click "delete all chats" (Settings menu).
--    SECURITY DEFINER so it can delete the other user''s rows too; RLS alone
--    would only allow deleting your own messages. Only signed-in users may
--    call it, and the app asks for confirmation before calling it.
--    Storage files are deleted separately by the app (see deleteAllChats
--    in src/lib/supabase.ts) — this function only clears the table.
-- ---------------------------------------------------------------------------
create or replace function public.delete_all_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.messages;
end;
$$;

comment on function public.delete_all_messages() is
  'Deletes every row in messages. Called by the Settings > Delete all chats action.';

revoke execute on function public.delete_all_messages() from public;
grant execute on function public.delete_all_messages() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. enforce_two_users — hard 2-user cap, enforced in the DB (not just UI).
--    A frontend count check alone can be bypassed via the API, so the
--    trigger rejects the 3rd profile row.
--    Known limit: two truly simultaneous signups could both pass the count
--    check (race). For a 2-person personal app this is acceptable; the
--    signup screen also hides registration once 2 profiles exist.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_two_users()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.profiles) >= 2 then
    raise exception 'Only 2 users allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_two_users_trigger on public.profiles;
create trigger enforce_two_users_trigger
  before insert on public.profiles
  for each row execute function public.enforce_two_users();

comment on function public.enforce_two_users() is
  'Trigger function: rejects a 3rd profile row so Dus Chat stays 2 users only.';

-- ---------------------------------------------------------------------------
-- 8. Realtime — messages must be in the supabase_realtime publication or
--    postgres_changes subscriptions in the app will never fire.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
