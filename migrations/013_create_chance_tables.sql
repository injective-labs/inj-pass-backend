-- Migration: create chance balance and transaction tables
-- Purpose: keep chance gameplay data separate from tap-game Redis state

begin;

alter table public.users
  add column if not exists "chanceRemaining" integer not null default 0,
  add column if not exists "chanceCooldownEndsAt" bigint not null default 0;

update public.users
set "chanceRemaining" = coalesce("chanceRemaining", 0),
    "chanceCooldownEndsAt" = coalesce("chanceCooldownEndsAt", 0)
where "chanceRemaining" is null
   or "chanceCooldownEndsAt" is null;

create table if not exists public.chance_transactions (
  id serial primary key,
  "userId" integer not null references public.users(id) on delete cascade,
  "txHash" varchar(128) not null unique,
  "chainId" varchar(50),
  "productId" varchar(50) not null,
  "chanceAmount" integer not null,
  "balanceAfter" integer not null,
  status varchar(20) not null default 'confirmed',
  metadata jsonb not null default '{}',
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

create index if not exists "IDX_chance_transactions_userId"
  on public.chance_transactions ("userId");

create index if not exists "IDX_chance_transactions_productId"
  on public.chance_transactions ("productId");

create index if not exists "IDX_chance_transactions_createdAt"
  on public.chance_transactions ("createdAt");

comment on table public.chance_transactions is 'Transaction log for on-chain chance purchases';
comment on column public.chance_transactions."txHash" is 'Unique on-chain transaction hash for idempotency';
comment on column public.chance_transactions."chanceAmount" is 'Chance count granted by the purchase';
comment on column public.chance_transactions."balanceAfter" is 'Chance balance after this purchase';

commit;