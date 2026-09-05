begin;

-- These integration tables are written/read only by the trusted server backend.
-- RLS already denied client access by having no policies; these explicit deny-all
-- policies make the intention auditable and silence the no-policy advisor notice.
create policy casting_integration_events_client_deny
on public.casting_integration_events
for all
to anon, authenticated
using (false)
with check (false);

create policy casting_invitation_projections_client_deny
on public.casting_invitation_projections
for all
to anon, authenticated
using (false)
with check (false);

commit;
