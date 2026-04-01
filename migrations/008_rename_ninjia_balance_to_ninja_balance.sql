-- Rename typo column ninjiaBalance -> ninjaBalance in users table
-- Safe to run once in Supabase SQL editor.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'ninjiaBalance'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'ninjaBalance'
  ) then
    alter table public.users
      rename column "ninjiaBalance" to "ninjaBalance";
  end if;
end
$$;

-- Ensure target column has expected type/default.
alter table public.users
  alter column "ninjaBalance" type numeric(20, 2) using "ninjaBalance"::numeric,
  alter column "ninjaBalance" set default 22.0;

commit;

-- Verification query (run after migration)
-- select id, "credentialId", "ninjaBalance" from public.users order by id desc limit 20;
