-- Vocab Print Pro: Note購入者向けライセンス機能
-- Supabase Dashboard > SQL Editor で一度だけ実行してください。
-- ライセンスコードの原文はDBに保存せず、ハッシュのみを保存します。

create extension if not exists pgcrypto;

create table if not exists public.license_products (
  slug text primary key,
  title text not null,
  wordbook_id text null,
  entitlement_kind text not null check (entitlement_kind in ('wordbook', 'personal')),
  description text not null default '',
  cover_image text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_codes (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null references public.license_products(slug) on delete cascade,
  code_hash text not null unique,
  is_active boolean not null default true,
  claimed_by uuid null references auth.users(id) on delete set null,
  claimed_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.license_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null references public.license_products(slug) on delete cascade,
  wordbook_id text null,
  entitlement_kind text not null check (entitlement_kind in ('wordbook', 'personal')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz null,
  claimed_from_code_id uuid null references public.license_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_slug)
);

alter table public.license_products enable row level security;
alter table public.license_codes enable row level security;
alter table public.license_entitlements enable row level security;

-- サービスロールだけが操作します。anon/authenticated用のポリシーは作りません。

-- 例: 最初の商品。wordbook_id は管理画面の実際の単語帳IDに置き換えてから有効化してください。
-- insert into public.license_products (slug, title, wordbook_id, entitlement_kind, description, is_active)
-- values ('system-eitango', 'システム英単語', 'ここを実際の単語帳IDに変更', 'wordbook', 'Note購入者向けの単語帳専用ライセンスです。', false);
