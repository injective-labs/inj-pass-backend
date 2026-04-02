-- Migration: 010_referral_and_user_registration_updates
-- Description:
-- 1) Align registration defaults: users.ninjaBalance default -> 0
-- 2) Normalize historical NULL balances to 0
-- 3) Add users.walletAddress and backfill from passkey_credentials
-- 4) Align users.createdAt with passkey_credentials.createdAt when credential is older
-- 5) Update referral reward defaults to 10/10
-- 6) Remove unique constraint on referral invite code to allow multiple invitees per inviter

begin;

-- 1) Ensure users.walletAddress exists
alter table public.users
  add column if not exists "walletAddress" varchar(100);

-- 2) Add unique index for users.walletAddress (nullable; multiple NULLs are allowed)
create unique index if not exists "IDX_users_walletAddress"
  on public.users ("walletAddress")
  where "walletAddress" is not null;

-- 3) Backfill users.walletAddress from passkey_credentials.walletAddress
with source as (
  select
    u.id as user_id,
    pc."walletAddress" as wallet_address,
    row_number() over (partition by pc."walletAddress" order by pc."createdAt" asc) as rn,
    count(*) over (partition by pc."walletAddress") as cnt
  from public.users u
  join public.passkey_credentials pc
    on pc."credentialId" = u."credentialId"
  where u."walletAddress" is null
    and pc."walletAddress" is not null
)
update public.users u
set "walletAddress" = s.wallet_address
from source s
where u.id = s.user_id
  and (s.cnt = 1 or s.rn = 1)
  and not exists (
    select 1
    from public.users ux
    where ux."walletAddress" = s.wallet_address
  );

-- 4) Align users.createdAt to historical passkey_credentials.createdAt when credential is older
update public.users u
set "createdAt" = pc."createdAt"
from public.passkey_credentials pc
where pc."credentialId" = u."credentialId"
  and pc."createdAt" < u."createdAt";

-- 5) Enforce numeric defaults for Ninja balance
alter table public.users
  alter column "ninjaBalance" type numeric(20, 2) using coalesce("ninjaBalance", 0)::numeric,
  alter column "ninjaBalance" set default 0;

update public.users
set "ninjaBalance" = 0
where "ninjaBalance" is null;

-- 6) Update referral reward defaults (support both snake_case and camelCase column styles)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_logs' and column_name = 'inviterReward'
  ) then
    execute 'alter table public.referral_logs alter column "inviterReward" set default 10';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_logs' and column_name = 'inviter_reward'
  ) then
    execute 'alter table public.referral_logs alter column inviter_reward set default 10';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_logs' and column_name = 'inviteeReward'
  ) then
    execute 'alter table public.referral_logs alter column "inviteeReward" set default 10';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_logs' and column_name = 'invitee_reward'
  ) then
    execute 'alter table public.referral_logs alter column invitee_reward set default 10';
  end if;
end $$;

-- 7) Drop unique constraint on invite code so one inviter code can map to many invitees
-- Supports both inviteCode/invite_code naming.
do $$
declare
  invite_code_unique_constraint text;
begin
  select tc.constraint_name
  into invite_code_unique_constraint
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
   and tc.table_schema = ccu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'referral_logs'
    and tc.constraint_type = 'UNIQUE'
    and ccu.column_name in ('inviteCode', 'invite_code')
  order by tc.constraint_name
  limit 1;

  if invite_code_unique_constraint is not null then
    execute format('alter table public.referral_logs drop constraint %I', invite_code_unique_constraint);
  end if;
end $$;

commit;
