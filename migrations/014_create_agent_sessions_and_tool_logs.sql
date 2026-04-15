CREATE TABLE IF NOT EXISTS agent_sessions (
  conversation_id varchar(100) PRIMARY KEY,
  credential_id varchar(512) NOT NULL,
  wallet_address varchar(100),
  title varchar(255) NOT NULL,
  model varchar(80) NOT NULL,
  sandbox_mode boolean NOT NULL DEFAULT false,
  sandbox_address varchar(100),
  sandbox_encrypted_key text,
  api_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_confirmation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tool_logs (
  id bigserial PRIMARY KEY,
  conversation_id varchar(100) NOT NULL,
  credential_id varchar(512) NOT NULL,
  tool_use_id varchar(120),
  tool_id varchar(100) NOT NULL,
  risk_level varchar(40) NOT NULL,
  input_json jsonb,
  output_json jsonb,
  status varchar(40) NOT NULL,
  error_code varchar(100),
  error_message text,
  tx_hash varchar(100),
  sandbox_address varchar(100),
  requires_confirmation boolean NOT NULL DEFAULT false,
  confirmed boolean,
  duration_ms integer,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_logs_conversation_id
ON agent_tool_logs (conversation_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_logs_tool_use_id
ON agent_tool_logs (tool_use_id);
