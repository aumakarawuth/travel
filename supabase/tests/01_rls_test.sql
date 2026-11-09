-- RLS / permission tests. Run with scripts/test-db.sh (fails on first error).
\set ON_ERROR_STOP 1
\pset tuples_only on
\o /dev/null
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'alice@x.test', '{"display_name":"Alice"}'),
 ('00000000-0000-0000-0000-00000000000b', 'bob@x.test',   '{"display_name":"Bob"}'),
 ('00000000-0000-0000-0000-00000000000c', 'carol@x.test', '{"display_name":"Carol"}');

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true);
$$;
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok - %', msg; end $$;

set local role authenticated;

-- profiles auto-created
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select display_name from profiles where id = auth.uid()) = 'Alice', 'profile auto-created');

-- Alice creates trip A, Bob creates trip B
insert into t_ids select 'A', create_trip('{"name":"Chiang Mai","start_date":"2026-12-01","end_date":"2026-12-03"}');
select pg_temp.expect((select role from trip_members where trip_id=(select v from t_ids where k='A') and user_id=auth.uid())='owner', 'creator is owner');
select pg_temp.expect((select day_count from trips where id=(select v from t_ids where k='A'))=3, 'day_count generated');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t_ids select 'B', create_trip('{"name":"Phuket","start_date":"2026-12-10","end_date":"2026-12-11"}');

-- isolation: Bob cannot see trip A, its members, or Alice's profile
select pg_temp.expect((select count(*) from trips where id=(select v from t_ids where k='A'))=0, 'non-member cannot read trip');
select pg_temp.expect((select count(*) from trip_members where trip_id=(select v from t_ids where k='A'))=0, 'non-member cannot read roster');
select pg_temp.expect((select count(*) from profiles where id='00000000-0000-0000-0000-00000000000a')=0, 'cannot read stranger profile');

-- Bob cannot insert a submission into trip A
do $$ begin
  insert into link_submissions (trip_id, submitted_by, original_url, normalized_url)
  values ((select v from t_ids where k='A'), auth.uid(), 'https://x.test', 'https://x.test');
  raise exception 'FAIL: cross-trip insert allowed';
exception when insufficient_privilege then raise notice 'ok - cross-trip insert blocked'; end $$;

-- Bob cannot update trip A (0 rows affected)
update trips set name='hacked' where id=(select v from t_ids where k='A');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select name from trips where id=(select v from t_ids where k='A'))='Chiang Mai', 'non-member update has no effect');

-- invite code: only editor/owner can read it
insert into t_ids select 'codeA', null;
do $$ declare c text := get_invite_code((select v from t_ids where k='A'));
begin perform set_config('t.code', c, true); end $$;
select pg_temp.expect(length(current_setting('t.code'))=8, 'owner can read invite code');
do $$ begin
  perform invite_code from trips limit 1;
  raise exception 'FAIL: invite_code column readable';
exception when insufficient_privilege then raise notice 'ok - invite_code column hidden'; end $$;

-- Bob joins A by code -> member
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select name from preview_invite(current_setting('t.code')))='Chiang Mai', 'preview by code');
select join_trip(lower(current_setting('t.code')));
select join_trip(current_setting('t.code')); -- idempotent
select pg_temp.expect((select role from trip_members where trip_id=(select v from t_ids where k='A') and user_id=auth.uid())='member', 'joined as member');
select pg_temp.expect(get_invite_code((select v from t_ids where k='A')) is null, 'member cannot read invite code');
select pg_temp.expect((select count(*) from profiles where id='00000000-0000-0000-0000-00000000000a')=1, 'co-member profile visible');

-- member cannot edit trip, cannot escalate own role, cannot remove others
update trips set name='nope' where id=(select v from t_ids where k='A');
do $$ begin
  update trip_members set role='owner' where user_id=auth.uid();
  raise exception 'FAIL: role self-escalation';
exception when insufficient_privilege then raise notice 'ok - role self-escalation blocked'; end $$;
do $$ begin
  perform remove_member((select v from t_ids where k='A'), '00000000-0000-0000-0000-00000000000a');
  raise exception 'FAIL: remove owner';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - member cannot remove owner (%)', sqlerrm; end $$;

-- member CAN submit a link as self, but not impersonate
insert into link_submissions (trip_id, submitted_by, original_url, normalized_url)
values ((select v from t_ids where k='A'), auth.uid(), 'https://a.test', 'https://a.test');
do $$ begin
  insert into link_submissions (trip_id, submitted_by, original_url, normalized_url)
  values ((select v from t_ids where k='A'), '00000000-0000-0000-0000-00000000000a', 'https://b.test', 'https://b.test');
  raise exception 'FAIL: impersonation';
exception when insufficient_privilege then raise notice 'ok - submit-as-other blocked'; end $$;
do $$ begin
  insert into link_submissions (trip_id, submitted_by, original_url, normalized_url)
  values ((select v from t_ids where k='A'), auth.uid(), 'https://a.test/x', 'https://a.test');
  raise exception 'FAIL: dup';
exception when unique_violation then raise notice 'ok - duplicate submission rejected'; end $$;

-- Phase 3: votes / selections / comments
with x as (insert into places (trip_id, name, name_normalized, created_by)
  values ((select v from t_ids where k='A'), 'Cafe', 'cafe', auth.uid()) returning id)
insert into t_ids select 'P', id from x;
insert into place_votes (trip_id, place_id, user_id, vote) values ((select v from t_ids where k='A'), (select v from t_ids where k='P'), auth.uid(), 'want');
select pg_temp.expect((select count(*) from place_votes where place_id=(select v from t_ids where k='P'))=1, 'member can vote');
do $$ begin
  insert into place_votes (trip_id, place_id, user_id, vote) values ((select v from t_ids where k='A'), (select v from t_ids where k='P'), '00000000-0000-0000-0000-00000000000a', 'want');
  raise exception 'FAIL: vote as other';
exception when insufficient_privilege then raise notice 'ok - cannot vote as someone else'; end $$;
do $$ begin
  insert into place_votes (trip_id, place_id, user_id, vote) values ((select v from t_ids where k='B'), (select v from t_ids where k='P'), auth.uid(), 'want');
  raise exception 'FAIL: cross-trip vote';
exception when insufficient_privilege then raise notice 'ok - cross-trip vote blocked'; end $$;
do $$ begin
  insert into trip_place_selections (trip_id, place_id, status) values ((select v from t_ids where k='A'), (select v from t_ids where k='P'), 'selected');
  raise exception 'FAIL: member selected';
exception when insufficient_privilege then raise notice 'ok - member cannot change selection'; end $$;
insert into place_comments (trip_id, place_id, user_id, body) values ((select v from t_ids where k='A'), (select v from t_ids where k='P'), auth.uid(), 'น่าไป');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update place_comments set deleted_at = now() where place_id=(select v from t_ids where k='P');
select pg_temp.expect((select count(*) from place_comments where place_id=(select v from t_ids where k='P') and deleted_at is null)=1, 'cannot delete others comments');
insert into trip_place_selections (trip_id, place_id, status, priority) values ((select v from t_ids where k='A'), (select v from t_ids where k='P'), 'selected', 'must_visit');
select pg_temp.expect((select status from trip_place_selections where place_id=(select v from t_ids where k='P'))='selected', 'owner can select place');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

-- owner promotes Bob to editor; editor can now edit trip
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select name from trips where id=(select v from t_ids where k='A'))='Chiang Mai', 'member update ignored');
select set_member_role((select v from t_ids where k='A'), '00000000-0000-0000-0000-00000000000b', 'editor');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update trips set name='Chiang Mai 2026' where id=(select v from t_ids where k='A');
select pg_temp.expect((select name from trips where id=(select v from t_ids where k='A'))='Chiang Mai 2026', 'editor can edit trip');

-- Carol joins; editor Bob can remove member Carol
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select join_trip(current_setting('t.code'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select remove_member((select v from t_ids where k='A'), '00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from trip_members where trip_id=(select v from t_ids where k='A'))=2, 'editor removed member');

-- editor cannot delete the trip (owner only)
delete from trips where id=(select v from t_ids where k='A');
select pg_temp.expect((select count(*) from trips where id=(select v from t_ids where k='A'))=1, 'editor cannot delete trip');

-- disabled invite code stops joins
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update trips set invite_enabled=false where id=(select v from t_ids where k='A');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  perform join_trip(current_setting('t.code'));
  raise exception 'FAIL: disabled invite';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - disabled invite rejected'; end $$;

-- audit trail written; readable by owner only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from audit_logs where trip_id=(select v from t_ids where k='A'))>=5, 'audit trail recorded');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from audit_logs)=0, 'outsider sees no audit logs');

-- owner deletes trip -> cascades cleanly
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from trips where id=(select v from t_ids where k='A');
select pg_temp.expect((select count(*) from trips where id=(select v from t_ids where k='A'))=0, 'owner deleted trip');

rollback;
\o
\echo ALL RLS TESTS PASSED
