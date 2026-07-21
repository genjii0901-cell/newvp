-- 管理ダッシュボードの集計に必要なカラム/テーブルを追加する。
-- Supabase の SQL Editor に貼り付けて「Run」してください。
-- IF NOT EXISTS 付きなので、何度実行しても安全です。

-- 1) profiles.role が無い
--    → profiles のクエリ全体が失敗し、プラン集計（Personal/Teacher数）が 0 になっていた。
alter table public.profiles
  add column if not exists role text not null default 'user';

-- 2) subscriptions.stripe_customer_id が無い
--    → Stripe購読の保存（checkout完了時のupsert）が失敗し、購読が記録されない。
alter table public.subscriptions
  add column if not exists stripe_customer_id text;

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

-- 3) pdf_generations テーブルが存在しない
--    → PDF/印刷の利用状況が一切記録されず、利用回数が 0 のままだった。
--    wordbook_id は公式単語帳(整数ID)・マイ単語帳(UUID)の両方を入れられるよう text にする。
create table if not exists public.pdf_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  wordbook_id text,
  type text,
  word_count integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists pdf_generations_created_at_idx
  on public.pdf_generations (created_at desc);

create index if not exists pdf_generations_user_id_idx
  on public.pdf_generations (user_id);

-- 記録の書き込みはサーバー(service role)が行うためRLSをバイパスする。
-- ユーザーは自分の履歴だけ読めるようにする（/history ページ用）。
alter table public.pdf_generations enable row level security;

drop policy if exists "pdf_generations_select_own" on public.pdf_generations;
create policy "pdf_generations_select_own"
  on public.pdf_generations for select
  using (auth.uid() = user_id);
