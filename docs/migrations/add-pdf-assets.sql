create table if not exists public.pdf_assets (
  id uuid primary key,
  asset_key text unique,
  title text not null,
  description text not null default '',
  wordbook_id text,
  wordbook_title text,
  kind text not null default 'generated' check (kind in ('generated', 'uploaded')),
  visibility text not null default 'admin' check (visibility in ('public', 'admin', 'sale')),
  variant text,
  output_kind text not null default 'uploaded' check (output_kind in ('full-pdf', 'sample-pdf', 'sample-image', 'uploaded')),
  price_jpy integer,
  bundle_price_jpy integer,
  is_sample boolean not null default false,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  storage_path text not null unique,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'r2')),
  file_name text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pdf_assets
  add column if not exists storage_provider text not null default 'supabase';

do $$
begin
  alter table public.pdf_assets
    add constraint pdf_assets_storage_provider_check
    check (storage_provider in ('supabase', 'r2'));
exception
  when duplicate_object then null;
end $$;

create index if not exists pdf_assets_wordbook_id_idx on public.pdf_assets(wordbook_id);
create index if not exists pdf_assets_visibility_idx on public.pdf_assets(visibility);
create index if not exists pdf_assets_created_at_idx on public.pdf_assets(created_at desc);

with legacy_catalog as (
  select jsonb_array_elements(
    case
      when value is not null and left(ltrim(value), 1) = '[' then value::jsonb
      else '[]'::jsonb
    end
  ) as item
  from public.app_settings
  where key = 'pdf_asset_catalog_v1'
)
insert into public.pdf_assets (
  id, asset_key, title, description, wordbook_id, wordbook_title, kind,
  visibility, variant, output_kind, price_jpy, bundle_price_jpy, is_sample,
  mime_type, storage_path, storage_provider, file_name, size_bytes, created_at
)
select
  (item->>'id')::uuid,
  nullif(item->>'assetKey', ''),
  coalesce(nullif(item->>'title', ''), 'PDF教材'),
  coalesce(item->>'description', ''),
  nullif(item->>'wordbookId', ''),
  nullif(item->>'wordbookTitle', ''),
  case when item->>'kind' = 'uploaded' then 'uploaded' else 'generated' end,
  case when item->>'visibility' in ('public', 'admin', 'sale') then item->>'visibility' else 'admin' end,
  nullif(item->>'variant', ''),
  case when item->>'outputKind' in ('full-pdf', 'sample-pdf', 'sample-image', 'uploaded') then item->>'outputKind' else 'uploaded' end,
  nullif(item->>'priceJpy', '')::integer,
  nullif(item->>'bundlePriceJpy', '')::integer,
  coalesce((item->>'isSample')::boolean, false),
  case when item->>'mimeType' in ('application/pdf', 'image/png', 'image/jpeg') then item->>'mimeType' else 'application/pdf' end,
  item->>'storagePath',
  'supabase',
  coalesce(nullif(item->>'fileName', ''), 'material.pdf'),
  coalesce(nullif(item->>'sizeBytes', '')::bigint, 0),
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from legacy_catalog
where item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and coalesce(item->>'storagePath', '') <> ''
on conflict (id) do nothing;

alter table public.pdf_assets enable row level security;
revoke all on public.pdf_assets from anon, authenticated;

comment on table public.pdf_assets is 'Private catalog for generated and uploaded PDF teaching materials. Accessed with the service role only.';
