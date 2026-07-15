-- 管理者2FAの秘密鍵などアプリ設定を保存する汎用テーブル。
-- Supabase SQL Editor で実行してください。

create table if not exists public.app_settings (
  key text primary key,
  value text
);

-- This table contains server-only settings such as the admin TOTP secret.
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.app_settings to service_role;
