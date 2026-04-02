-- Cleanup script: remove passkey credentials that have no wallet data
-- This also removes dependent user data first to avoid foreign key violations.

begin;

create temporary table cleanup_target_credentials on commit drop as
select
  pc."credentialId"
from public.passkey_credentials pc
where pc."walletAddress" is null
  and pc."walletName" is null;

create temporary table cleanup_target_users on commit drop as
select
  u.id,
  u."credentialId"
from public.users u
join cleanup_target_credentials tc
  on tc."credentialId" = u."credentialId";

-- Remove user-owned content first.
delete from public.conversations c
using cleanup_target_users tu
where c."credentialId" = tu."credentialId";

delete from public.referral_logs rl
using cleanup_target_users tu
where rl."inviterId" = tu.id
   or rl."inviteeId" = tu.id;

delete from public.points_transactions pt
using cleanup_target_users tu
where pt."userId" = tu.id;

delete from public.ai_usage_logs aul
using cleanup_target_users tu
where aul."userId" = tu.id;

delete from public.users u
using cleanup_target_users tu
where u.id = tu.id;

-- Finally remove the orphan passkey credentials.
delete from public.passkey_credentials pc
using cleanup_target_credentials tc
where pc."credentialId" = tc."credentialId";

commit;

-- Optional verification:
-- select count(*) from public.passkey_credentials where "walletAddress" is null and "walletName" is null;