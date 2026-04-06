begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_usage_logs'
      and column_name = 'costNinjia'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_usage_logs'
      and column_name = 'costNinja'
  ) then
    alter table public.ai_usage_logs
      rename column "costNinjia" to "costNinja";
  end if;
end
$$;

alter table public.ai_usage_logs
  alter column "costNinja" type numeric(20, 4) using "costNinja"::numeric;

commit;
