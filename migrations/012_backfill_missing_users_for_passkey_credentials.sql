-- Backfill script: ensure every passkey credential has a corresponding users row.
-- Also backfill passkey_credentials.userId with the created users.id as text for legacy/admin visibility.

begin;

-- Make sure users can store all historical wallet addresses.
alter table public.users
  add column if not exists "walletAddress" varchar(100);

create unique index if not exists "IDX_users_walletAddress"
  on public.users ("walletAddress")
  where "walletAddress" is not null;

-- Temporary source set of credentials that do not yet have a users row.
create temporary table backfill_missing_credentials on commit drop as
select
  pc."credentialId",
  pc."walletAddress",
  pc."createdAt"
from public.passkey_credentials pc
left join public.users u
  on u."credentialId" = pc."credentialId"
where u.id is null;

-- Insert one users row per missing credential.
-- Invite codes are generated in SQL and retried until unique via a loop.
do $$
declare
  cred record;
  new_invite_code text;
  invite_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  is_unique boolean;
begin
  for cred in
    select *
    from backfill_missing_credentials
    order by "createdAt" asc, "credentialId" asc
  loop
    loop
      new_invite_code := '';
      for i in 1..8 loop
        new_invite_code := new_invite_code || substr(invite_chars, floor(random() * length(invite_chars))::int + 1, 1);
      end loop;

      select not exists (
        select 1 from public.users u where u."inviteCode" = new_invite_code
      ) into is_unique;

      exit when is_unique;
    end loop;

    insert into public.users (
      "credentialId",
      "inviteCode",
      "invitedBy",
      "ninjaBalance",
      "walletAddress",
      "createdAt",
      "updatedAt"
    ) values (
      cred."credentialId",
      new_invite_code,
      null,
      0,
      cred."walletAddress",
      cred."createdAt",
      cred."createdAt"
    )
    on conflict ("credentialId") do nothing;
  end loop;
end $$;

-- Backfill the legacy passkey_credentials.userId field to the created users.id as text.
update public.passkey_credentials pc
set "userId" = u.id::text
from public.users u
where u."credentialId" = pc."credentialId"
  and (pc."userId" is null or pc."userId" <> u.id::text);

-- Keep user balances numeric and default to zero.
alter table public.users
  alter column "ninjaBalance" type numeric(20, 2) using coalesce("ninjaBalance", 0)::numeric,
  alter column "ninjaBalance" set default 0;

update public.users
set "ninjaBalance" = 0
where "ninjaBalance" is null;

commit;

-- Verification queries:
-- 1) credentials without users rows should be zero
-- select count(*) from public.passkey_credentials pc left join public.users u on u."credentialId" = pc."credentialId" where u.id is null;
-- 2) users balance should not contain nulls
-- select count(*) from public.users where "ninjaBalance" is null;
-- 3) passkey_credentials.userId should be populated for existing users
-- select count(*) from public.passkey_credentials where "userId" is null;