-- Apply in the Supabase SQL Editor after confirming the profiles table has plan and role.
-- Browser users may edit their ordinary profile fields, but never billing or admin access.
begin;

create or replace function public.guard_profile_entitlements()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.plan is distinct from 'free' or new.role is distinct from 'user' then
        raise exception 'Plan and role can only be set by the server.' using errcode = '42501';
      end if;
    elsif new.plan is distinct from old.plan or new.role is distinct from old.role then
      raise exception 'Plan and role can only be changed by the server.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_entitlements_trigger on public.profiles;
create trigger guard_profile_entitlements_trigger
before insert or update on public.profiles
for each row execute function public.guard_profile_entitlements();

commit;
