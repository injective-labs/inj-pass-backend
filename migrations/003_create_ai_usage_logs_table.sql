-- Migration: Create ai_usage_logs table for tracking AI token consumption
-- Records all AI chat usage for billing and analytics

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_ninjia DECIMAL(20, 4) NOT NULL,
  conversation_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster user usage lookups
CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_user_id" ON ai_usage_logs(user_id);

-- Create index on conversation_id for linking to conversations
CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_conversation_id" ON ai_usage_logs(conversation_id);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_created_at" ON ai_usage_logs(created_at);

-- Add comments
COMMENT ON TABLE ai_usage_logs IS 'Usage logs for AI chat consumption';
COMMENT ON COLUMN ai_usage_logs.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN ai_usage_logs.model IS 'AI model used (e.g., claude-sonnet-4-6)';
COMMENT ON COLUMN ai_usage_logs.input_tokens IS 'Number of input tokens';
COMMENT ON COLUMN ai_usage_logs.output_tokens IS 'Number of output tokens';
COMMENT ON COLUMN ai_usage_logs.cost_ninjia IS 'Cost in NIJIA tokens';
COMMENT ON COLUMN ai_usage_logs.conversation_id IS 'Optional link to conversation';
