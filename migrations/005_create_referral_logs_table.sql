-- Migration: 005_create_referral_logs_table
-- Description: Create referral_logs table to track invitation relationships and rewards

-- Create referral_logs table
CREATE TABLE IF NOT EXISTS referral_logs (
  id SERIAL PRIMARY KEY,
  invite_code VARCHAR(20) UNIQUE NOT NULL,
  inviter_id INTEGER REFERENCES users(id),
  invitee_id INTEGER REFERENCES users(id),
  inviter_reward DECIMAL(20, 2) NOT NULL DEFAULT 100,
  invitee_reward DECIMAL(20, 2) NOT NULL DEFAULT 50,
  inviter_reward_paid BOOLEAN DEFAULT FALSE,
  invitee_reward_paid BOOLEAN DEFAULT FALSE,
  inviter_transaction_id INTEGER REFERENCES points_transactions(id),
  invitee_transaction_id INTEGER REFERENCES points_transactions(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_referral_logs_invite_code ON referral_logs(invite_code);
CREATE INDEX IF NOT EXISTS idx_referral_logs_inviter ON referral_logs(inviter_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_invitee ON referral_logs(invitee_id);

-- Add tool_use and tool_result columns to messages table for AI chat with tools
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_use JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_result JSONB;
