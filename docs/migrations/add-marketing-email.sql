-- Marketing email preferences and delivery audit.
-- Run this file once in Supabase SQL Editor.

alter table public.profiles
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists marketing_email_opted_in_at timestamptz;

create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience text not null default 'free_opted_in',
  recipient_count integer not null default 0,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.marketing_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_email_campaigns(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  resend_email_id text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists marketing_email_campaigns_created_at_idx
  on public.marketing_email_campaigns (created_at desc);

create index if not exists marketing_email_deliveries_campaign_id_idx
  on public.marketing_email_deliveries (campaign_id);

alter table public.marketing_email_campaigns enable row level security;
alter table public.marketing_email_deliveries enable row level security;

revoke all on table public.marketing_email_campaigns from anon, authenticated;
revoke all on table public.marketing_email_deliveries from anon, authenticated;
grant all on table public.marketing_email_campaigns to service_role;
grant all on table public.marketing_email_deliveries to service_role;
