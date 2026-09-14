create index business_activity_events_source_instance_idx
  on public.business_activity_events(source_instance_id)
  where source_instance_id is not null;

create index business_bridge_devices_location_idx
  on public.business_bridge_devices(location_id)
  where location_id is not null;

create index business_erp_raw_events_bridge_device_idx
  on public.business_erp_raw_events(bridge_device_id);

create index business_erp_raw_events_connection_idx
  on public.business_erp_raw_events(connection_id);

create index business_erp_raw_events_location_idx
  on public.business_erp_raw_events(location_id)
  where location_id is not null;

create index business_erp_source_instances_location_idx
  on public.business_erp_source_instances(location_id)
  where location_id is not null;

create index business_parties_sanad_user_idx
  on public.business_parties(sanad_user_id)
  where sanad_user_id is not null;

create index business_party_source_refs_party_idx
  on public.business_party_source_refs(party_id);

alter function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz)
  security invoker;

-- Split owner mutations from SELECT so the shared member SELECT policy remains singular.
drop policy if exists business_locations_owner_write on public.business_locations;
create policy business_locations_owner_insert
on public.business_locations for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_locations_owner_update
on public.business_locations for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_locations_owner_delete
on public.business_locations for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_accounting_connections_owner_write on public.business_accounting_connections;
create policy business_accounting_connections_owner_insert
on public.business_accounting_connections for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_accounting_connections_owner_update
on public.business_accounting_connections for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_accounting_connections_owner_delete
on public.business_accounting_connections for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_erp_source_instances_owner_write on public.business_erp_source_instances;
create policy business_erp_source_instances_owner_insert
on public.business_erp_source_instances for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_erp_source_instances_owner_update
on public.business_erp_source_instances for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_erp_source_instances_owner_delete
on public.business_erp_source_instances for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_bridge_devices_owner_write on public.business_bridge_devices;
create policy business_bridge_devices_owner_insert
on public.business_bridge_devices for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_bridge_devices_owner_update
on public.business_bridge_devices for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_bridge_devices_owner_delete
on public.business_bridge_devices for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_parties_owner_write on public.business_parties;
create policy business_parties_owner_insert
on public.business_parties for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_parties_owner_update
on public.business_parties for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_parties_owner_delete
on public.business_parties for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_party_roles_owner_write on public.business_party_roles;
create policy business_party_roles_owner_insert
on public.business_party_roles for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_party_roles_owner_update
on public.business_party_roles for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_party_roles_owner_delete
on public.business_party_roles for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));

drop policy if exists business_party_source_refs_owner_write on public.business_party_source_refs;
create policy business_party_source_refs_owner_insert
on public.business_party_source_refs for insert to authenticated
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_party_source_refs_owner_update
on public.business_party_source_refs for update to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));
create policy business_party_source_refs_owner_delete
on public.business_party_source_refs for delete to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())));