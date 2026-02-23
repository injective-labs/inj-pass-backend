-- Migration: Add database-level protection for walletAddress and walletName
-- These fields should NEVER be cleared once set
-- This prevents accidental data loss during recovery operations

-- Create a trigger function to prevent clearing of wallet fields
CREATE OR REPLACE FUNCTION prevent_wallet_field_clear()
RETURNS TRIGGER AS $$
BEGIN
  -- If walletAddress was set and is being changed to NULL, prevent it
  IF OLD."walletAddress" IS NOT NULL AND NEW."walletAddress" IS NULL THEN
    NEW."walletAddress" = OLD."walletAddress";
  END IF;
  
  -- If walletName was set and is being changed to NULL, prevent it
  IF OLD."walletName" IS NOT NULL AND NEW."walletName" IS NULL THEN
    NEW."walletName" = OLD."walletName";
  END IF;
  
  -- Also prevent changing walletAddress to a different value once set
  IF OLD."walletAddress" IS NOT NULL AND NEW."walletAddress" IS NOT NULL 
     AND OLD."walletAddress" != NEW."walletAddress" THEN
    NEW."walletAddress" = OLD."walletAddress";
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS protect_wallet_fields_trigger ON passkey_credentials;

-- Create trigger on UPDATE operations
CREATE TRIGGER protect_wallet_fields_trigger
  BEFORE UPDATE ON passkey_credentials
  FOR EACH ROW
  EXECUTE FUNCTION prevent_wallet_field_clear();

-- Add comment explaining the protection
COMMENT ON FUNCTION prevent_wallet_field_clear() IS 
'Prevents walletAddress and walletName from being cleared or changed once set. Critical for wallet recovery.';
