begin;

-- Map assets are presentation data, never canonical world truth. Keep the bucket
-- private and aligned with the shared V0 import contract. Browser clients still
-- receive no INSERT/UPDATE/DELETE policy; trusted server code owns writes.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'map-assets',
  'map-assets',
  false,
  2097152,
  array['image/svg+xml', 'image/webp', 'image/png']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
