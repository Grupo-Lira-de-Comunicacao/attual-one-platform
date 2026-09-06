begin;

revoke update on table public.deliveries from authenticated;
grant update(driver_name,driver_phone,status,assigned_at,updated_at) on public.deliveries to authenticated;

-- GPS coordinates and capability tokens are service-side only.
do $$
begin
  if has_column_privilege('authenticated','public.deliveries','public_tracking_token','UPDATE')
     or has_column_privilege('authenticated','public.deliveries','driver_access_token','UPDATE')
     or has_column_privilege('authenticated','public.deliveries','current_lat','UPDATE')
     or has_column_privilege('authenticated','public.deliveries','current_lng','UPDATE') then
    raise exception 'DELIVERY SECURITY FAILED: protected delivery columns remain writable';
  end if;
end $$;

commit;
