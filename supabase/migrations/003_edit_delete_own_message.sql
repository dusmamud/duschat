-- 003_edit_delete_own_message.sql
-- Dus Chat — edit own message / delete own message.
-- Idempotent: safe to re-run. Prereq: 001_init.sql.
alter table public.messages
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists edited boolean not null default false;
update public.messages set updated_at = created_at where updated_at is distinct from created_at;
alter table public.messages
  add constraint messages_content_max_length check (char_length(content) <= 20000),
  add constraint messages_file_name_max_length check (file_name is null or char_length(file_name) <= 255),
  add constraint messages_file_url_no_http check (file_url is null or file_url not like 'http%');
create or replace function public.set_message_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.edited := true; return new; end; $$;
drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at before update on public.messages for each row execute function public.set_message_updated_at();
create or replace function public.guard_message_edit() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.sender_id is distinct from old.sender_id or new.created_at is distinct from old.created_at or new.type is distinct from old.type or new.file_url is distinct from old.file_url or new.file_name is distinct from old.file_name or new.file_size is distinct from old.file_size or new.reply_to is distinct from old.reply_to then
    raise exception 'Only message content may be edited';
  end if;
  return new;
end; $$;
drop trigger if exists messages_guard_edit on public.messages;
create trigger messages_guard_edit before update on public.messages for each row execute function public.guard_message_edit();
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
