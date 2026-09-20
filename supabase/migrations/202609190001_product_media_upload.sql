begin;

alter table public.products
  add column if not exists video_url text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'product-media',
  'product-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']::text[]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists product_media_insert on storage.objects;
drop policy if exists product_media_update on storage.objects;
drop policy if exists product_media_delete on storage.objects;

create policy product_media_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='product-media'
  and public.has_company_role(
    case
      when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',1)::uuid
      else null
    end,
    array['owner','manager']::public.company_role[]
  )
);

create policy product_media_update
on storage.objects
for update
to authenticated
using (
  bucket_id='product-media'
  and public.has_company_role(
    case
      when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',1)::uuid
      else null
    end,
    array['owner','manager']::public.company_role[]
  )
)
with check (
  bucket_id='product-media'
  and public.has_company_role(
    case
      when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',1)::uuid
      else null
    end,
    array['owner','manager']::public.company_role[]
  )
);

create policy product_media_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='product-media'
  and public.has_company_role(
    case
      when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',1)::uuid
      else null
    end,
    array['owner','manager']::public.company_role[]
  )
);

commit;
