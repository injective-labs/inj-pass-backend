-- Migration: Add walletAddress and walletName columns to passkey_credentials table
-- This allows storing the user's wallet address and display name in the database
-- so they can be recovered even if localStorage is cleared

-- Add walletAddress column
ALTER TABLE passkey_credentials 
ADD COLUMN IF NOT EXISTS "walletAddress" VARCHAR(100);

-- Add walletName column
ALTER TABLE passkey_credentials 
ADD COLUMN IF NOT EXISTS "walletName" VARCHAR(100);

-- Create index on walletAddress for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_passkey_credentials_walletAddress" 
ON passkey_credentials ("walletAddress");

-- Create index on walletName for faster duplicate checks
CREATE INDEX IF NOT EXISTS "IDX_passkey_credentials_walletName" 
ON passkey_credentials ("walletName");

-- Add comments
COMMENT ON COLUMN passkey_credentials."walletAddress" IS 'User wallet public address associated with this passkey credential';
COMMENT ON COLUMN passkey_credentials."walletName" IS 'User-friendly display name for the wallet (auto-incremented if duplicate)';
