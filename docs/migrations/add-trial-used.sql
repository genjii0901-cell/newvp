-- 1ヶ月無料トライアルの乱用防止フラグ
-- Supabase SQL Editor で実行してください。
-- 既に列がある場合は何もしません（IF NOT EXISTS）。

alter table public.profiles
  add column if not exists trial_used boolean not null default false;
