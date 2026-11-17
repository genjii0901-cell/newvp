-- 例文（1単語に複数）と、文法・一問一答・4択の問題を保存するテーブル。
-- 管理者のサーバー処理（service role）だけが読み書きする。公開はしない（status = draft）。
-- Supabase の SQL Editor で1回実行する。何度実行しても安全。

-- 1) 単語ごとの例文。words の id は単語帳の再保存で変わるため、番号と英語で結びつける。
create table if not exists public.word_examples (
  id uuid primary key default gen_random_uuid(),
  wordbook_id text not null,
  word_number text not null default '',
  word_english text not null default '',
  sort_order integer not null default 0,
  sentence_en text not null,
  sentence_ja text not null default '',
  source text not null default 'import',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  unique (wordbook_id, word_number, word_english, sentence_en)
);
create index if not exists word_examples_wordbook_idx on public.word_examples(wordbook_id, word_number);
alter table public.word_examples enable row level security;

-- 2) 問題セット（文法教材・一問一答など。単語帳とは別に管理する）
create table if not exists public.question_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'grammar' check (kind in ('grammar', 'qa', 'other')),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);
alter table public.question_sets enable row level security;

-- 3) 問題。選択肢は「固定（保存した誤答）」「同じタグから自動」「ランダム」から選ぶ。
create table if not exists public.question_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  sort_order integer not null default 0,
  item_kind text not null default 'choice' check (item_kind in ('blank', 'underline', 'choice', 'qa')),
  prompt text not null,
  answer text not null,
  wrong_choices jsonb not null default '[]'::jsonb,
  choice_mode text not null default 'fixed' check (choice_mode in ('fixed', 'pool', 'random')),
  pool_tag text not null default '',
  explanation text not null default '',
  unit text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists question_items_set_idx on public.question_items(set_id, sort_order);
create index if not exists question_items_pool_idx on public.question_items(set_id, pool_tag);
alter table public.question_items enable row level security;

-- 4) 数学・物理など他教科の教材にも使えるよう、教科の欄を足し、種類の制限をゆるめる。
alter table public.question_sets add column if not exists subject text not null default '';
alter table public.question_sets drop constraint if exists question_sets_kind_check;
