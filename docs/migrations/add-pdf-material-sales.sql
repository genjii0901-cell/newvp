create table if not exists public.material_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  purchase_type text not null check (purchase_type in ('asset', 'wordbook')),
  asset_id text,
  wordbook_id text,
  amount_jpy integer not null check (amount_jpy > 0),
  status text not null default 'paid',
  created_at timestamptz not null default now(),
  constraint material_purchase_target check (
    (purchase_type = 'asset' and asset_id is not null) or
    (purchase_type = 'wordbook' and wordbook_id is not null)
  )
);

create index if not exists material_purchases_user_id_idx on public.material_purchases(user_id);
create index if not exists material_purchases_wordbook_id_idx on public.material_purchases(wordbook_id);
create index if not exists material_purchases_asset_id_idx on public.material_purchases(asset_id);

alter table public.material_purchases enable row level security;

drop policy if exists "Users can view own material purchases" on public.material_purchases;
create policy "Users can view own material purchases"
  on public.material_purchases for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.material_purchases from anon, authenticated;
grant select on public.material_purchases to authenticated;

