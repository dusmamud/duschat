-- 004_delete_all_where.sql
-- Dus Chat — fix Settings > Delete all chats ("DELETE requires a WHERE clause").
-- Idempotent: safe to re-run. Prereq: 001_init.sql.
--
-- The 001 version of delete_all_messages() did a bare `delete from
-- public.messages;`. When called through the Supabase API that trips the
-- "DELETE requires a WHERE clause" guard, so Delete all chats failed.
-- The standard workaround is an explicit WHERE clause that still matches
-- every row: `where true`. The function is otherwise unchanged — same
-- SECURITY DEFINER, same auth check, same grants.
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
  delete from public.messages where true;
end;
$$;

comment on function public.delete_all_messages() is
  'Deletes every row in messages. Called by the Settings > Delete all chats action.';

revoke execute on function public.delete_all_messages() from public;
grant execute on function public.delete_all_messages() to authenticated;
