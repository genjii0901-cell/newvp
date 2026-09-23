-- 初回トライアルは profiles.trial_used で1回に制限する。
-- 解約から90日以上経過した人には、生涯1回だけお帰りキャンペーンを出せる。

alter table public.profiles
  add column if not exists winback_trial_used boolean not null default false;

alter table public.profiles
  add column if not exists winback_trial_eligible_at timestamptz;

comment on column public.profiles.winback_trial_used is
  'お帰りなさい7日無料キャンペーンを利用済みか';

comment on column public.profiles.winback_trial_eligible_at is
  'この日時以降、お帰りなさい7日無料キャンペーンの対象になる';
