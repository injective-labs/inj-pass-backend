-- Migration: Create Cat NFT tables and add Cat NFT fields to users
-- This single file is safe to run multiple times in Supabase.

begin;

alter table public.users
  add column if not exists "mintCreditsRemaining" integer not null default 0;

alter table public.users
  add column if not exists "catMintNonce" bigint not null default 0;

update public.users
set "mintCreditsRemaining" = 0
where "mintCreditsRemaining" is null;

update public.users
set "catMintNonce" = 0
where "catMintNonce" is null;

create table if not exists public.cat_asset_batches (
  id bigserial primary key,
  "name" varchar(120) not null,
  "metadataCid" varchar(255) not null unique,
  "imageCid" varchar(255),
  "baseURI" varchar(512) not null,
  "totalItems" integer not null default 0,
  "status" varchar(32) not null default 'draft',
  metadata jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.cat_metadata_items (
  id bigserial primary key,
  "batchId" integer not null,
  "serialNo" integer not null,
  "name" varchar(255) not null,
  description text,
  image varchar(1024),
  attributes jsonb,
  metadata jsonb,
  status varchar(32) not null default 'ready',
  minted boolean not null default false,
  "mintedTokenId" varchar(128),
  "mintedTxHash" varchar(128),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint uq_cat_metadata_batch_serial unique ("batchId", "serialNo")
);

create table if not exists public.cat_mint_records (
  id bigserial primary key,
  "userId" integer,
  "ownerAddress" varchar(100) not null,
  "tokenId" varchar(128) not null,
  "txHash" varchar(128) not null,
  "contractAddress" varchar(100),
  "metadataItemId" integer,
  source varchar(40) not null default 'frontend',
  "mintedAt" timestamptz,
  metadata jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint uq_cat_mint_tx_token unique ("txHash", "tokenId")
);

create table if not exists public.mint_credit_ledger (
  id bigserial primary key,
  "userId" integer not null,
  delta integer not null,
  "balanceAfter" integer not null,
  source varchar(64) not null,
  "sourceRef" varchar(255),
  metadata jsonb,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_cat_metadata_items_batch_id
on public.cat_metadata_items ("batchId");

create index if not exists idx_cat_metadata_items_status
on public.cat_metadata_items (status, minted);

create index if not exists idx_cat_mint_records_owner
on public.cat_mint_records ("ownerAddress");

create index if not exists idx_mint_credit_ledger_user_id
on public.mint_credit_ledger ("userId");

commit;
