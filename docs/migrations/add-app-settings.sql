-- 管理者2FAの秘密鍵などアプリ設定を保存する汎用テーブル。
-- Supabase SQL Editor で実行してください。

create table if not exists public.app_settings (
  key text primary key,
  value text
);
