-- Supabase advisor hardening: trigger functions are not RPCs; helpers are not for anon.
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user(), public.audit_row(), public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.trip_role_of(uuid, uuid), public.is_trip_member(uuid), public.can_edit_trip(uuid),
  public.is_trip_owner(uuid), public.shares_trip_with(uuid) from public, anon;
grant execute on function public.trip_role_of(uuid, uuid), public.is_trip_member(uuid), public.can_edit_trip(uuid),
  public.is_trip_owner(uuid), public.shares_trip_with(uuid) to authenticated;
