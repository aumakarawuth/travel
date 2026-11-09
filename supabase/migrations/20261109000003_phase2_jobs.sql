-- Phase 2: the extraction pipeline runs server-side with the requesting user's JWT
-- (no service-role key needed), so members may create/update jobs for their own trip.
create policy jobs_insert on public.ai_extraction_jobs for insert to authenticated
  with check (public.is_trip_member(trip_id) and requested_by = auth.uid()
              and exists (select 1 from public.link_submissions s where s.id = submission_id and s.trip_id = ai_extraction_jobs.trip_id));
create policy jobs_update on public.ai_extraction_jobs for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- place_sources need an update path for re-runs; keep evidence append-only otherwise
create index if not exists place_sources_submission_idx on public.place_sources(submission_id);
