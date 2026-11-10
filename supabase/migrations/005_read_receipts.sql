-- 005_read_receipts.sql
-- Dus Chat — read receipts (green tick when the other user reads your message).
-- Idempotent: safe to re-run. Prereq: 001_init.sql.
--
-- Each message carries read_at (null = not yet read by the other user).
-- The recipient marks messages as read by calling mark_messages_read(),
-- a SECURITY DEFINER function — the recipient cannot UPDATE the sender's
-- rows directly (messages_update_own only allows updating your own).
-- Best practice (iMessage / WhatsApp): opening the conversation marks its
-- messages as read. The sender sees the tick flip live via the realtime
-- UPDATE event on the messages row.
--
-- The set_message_updated_at trigger is also fixed here: it used to set
-- edited=true on EVERY update, so marking a message as read would wrongly
-- show "(edited)". It now only touches updated_at/edited when the content
-- actually changes; a read (read_at only) leaves both alone.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists read_at timestamptz;

-- Partial index: the mark-as-read UPDATE only touches unread rows.
create index if not exists messages_unread_idx on public.messages (sender_id, read_at)
  where read_at is null;

create or replace function public.set_message_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.content is distinct from old.content then
    new.updated_at := now();
    new.edited := true;
  end if;
  return new;
end;
$$;

create or replace function public.mark_messages_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.messages
     set read_at = now()
   where sender_id <> auth.uid()
     and read_at is null;
end;
$$;

comment on function public.mark_messages_read() is
  'Marks every unread message from the other user as read (sets read_at). Called when the recipient has the chat open.';

revoke execute on function public.mark_messages_read() from public;
grant execute on function public.mark_messages_read() to authenticated;
