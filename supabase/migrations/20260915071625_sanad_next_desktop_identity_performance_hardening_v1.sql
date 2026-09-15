create index if not exists business_bridge_authorization_sessions_location_idx
  on public.business_bridge_authorization_sessions(location_id)
  where location_id is not null;

create index if not exists business_bridge_authorization_sessions_connection_idx
  on public.business_bridge_authorization_sessions(connection_id)
  where connection_id is not null;

create index if not exists business_bridge_authorization_sessions_source_instance_idx
  on public.business_bridge_authorization_sessions(source_instance_id)
  where source_instance_id is not null;
