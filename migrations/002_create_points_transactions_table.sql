-- Migration: Create points_transactions table for tracking NIJIA balance changes
-- Records all NIJIA earning and spending activities

CREATE TABLE IF NOT EXISTS points_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(20, 4) NOT NULL,
  balance_after DECIMAL(20, 2) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster balance history lookups
CREATE INDEX IF NOT EXISTS "IDX_points_transactions_user_id" ON points_transactions(user_id);

-- Create index on type for filtering by transaction type
CREATE INDEX IF NOT EXISTS "IDX_points_transactions_type" ON points_transactions(type);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS "IDX_points_transactions_created_at" ON points_transactions(created_at);

-- Add comments
COMMENT ON TABLE points_transactions IS 'Transaction log for NIJIA points changes';
COMMENT ON COLUMN points_transactions.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN points_transactions.type IS 'Transaction type: tap_game, referral_bonus, ai_spent';
COMMENT ON COLUMN points_transactions.amount IS 'Amount change (positive for earning, negative for spending)';
COMMENT ON COLUMN points_transactions.balance_after IS 'Balance after this transaction';
COMMENT ON COLUMN points_transactions.metadata IS 'Additional data in JSON format';
