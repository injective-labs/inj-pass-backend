-- Migration: Create users table for NIJIA points and referral system
-- This table extends passkey_credentials with user-specific data like NIJIA balance and invite codes

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  credential_id VARCHAR(512) UNIQUE REFERENCES passkey_credentials(credential_id),
  invite_code VARCHAR(20) UNIQUE NOT NULL,
  invited_by VARCHAR(20),
  ninjia_balance DECIMAL(20, 2) DEFAULT 22.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on invite_code for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_users_invite_code" ON users(invite_code);

-- Create index on credential_id for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_users_credential_id" ON users(credential_id);

-- Create index on invited_by for finding invitees
CREATE INDEX IF NOT EXISTS "IDX_users_invited_by" ON users(invited_by);

-- Add comments
COMMENT ON TABLE users IS 'Extended user information for NIJIA points and referral system';
COMMENT ON COLUMN users.credential_id IS 'Foreign key to passkey_credentials table';
COMMENT ON COLUMN users.invite_code IS 'Unique invite code for this user';
COMMENT ON COLUMN users.invited_by IS 'Invite code of the user who invited this user';
COMMENT ON COLUMN users.ninjia_balance IS 'Current NIJIA points balance';
