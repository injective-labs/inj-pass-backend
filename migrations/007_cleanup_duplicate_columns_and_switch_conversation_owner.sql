-- Migration: clean duplicate camelCase/snake_case columns
-- and switch conversations ownership to credentialId

-- =========================
-- users: keep camelCase columns
-- =========================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credential_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credentialId'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN credential_id TO "credentialId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'invite_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'inviteCode'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN invite_code TO "inviteCode"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'invited_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'invitedBy'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN invited_by TO "invitedBy"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'ninjia_balance'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'ninjiaBalance'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN ninjia_balance TO "ninjiaBalance"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'createdAt'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN created_at TO "createdAt"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updatedAt'
  ) THEN
    EXECUTE 'ALTER TABLE users RENAME COLUMN updated_at TO "updatedAt"';
  END IF;
END $$;

ALTER TABLE users DROP COLUMN IF EXISTS credential_id;
ALTER TABLE users DROP COLUMN IF EXISTS invite_code;
ALTER TABLE users DROP COLUMN IF EXISTS invited_by;
ALTER TABLE users DROP COLUMN IF EXISTS ninjia_balance;
ALTER TABLE users DROP COLUMN IF EXISTS created_at;
ALTER TABLE users DROP COLUMN IF EXISTS updated_at;

-- =========================
-- ai_usage_logs: keep camelCase columns
-- =========================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'userId'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN user_id TO "userId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'input_tokens'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'inputTokens'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN input_tokens TO "inputTokens"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'output_tokens'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'outputTokens'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN output_tokens TO "outputTokens"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'cost_ninjia'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'costNinjia'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN cost_ninjia TO "costNinjia"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'conversation_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'conversationId'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN conversation_id TO "conversationId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'createdAt'
  ) THEN
    EXECUTE 'ALTER TABLE ai_usage_logs RENAME COLUMN created_at TO "createdAt"';
  END IF;
END $$;

ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS user_id;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS input_tokens;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS output_tokens;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS cost_ninjia;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS created_at;

-- =========================
-- conversations: use credentialId, remove user_id
-- =========================
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "credentialId" VARCHAR(512);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'credential_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'credentialId'
  ) THEN
    EXECUTE 'ALTER TABLE conversations RENAME COLUMN credential_id TO "credentialId"';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    EXECUTE '
      UPDATE conversations c
      SET "credentialId" = u."credentialId"
      FROM users u
      WHERE c."credentialId" IS NULL AND c.user_id = u.id
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'userId'
  ) THEN
    EXECUTE '
      UPDATE conversations c
      SET "credentialId" = u."credentialId"
      FROM users u
      WHERE c."credentialId" IS NULL AND c."userId" = u.id
    ';
  END IF;
END $$;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS "FK_conversations_user_id";
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS "FK_conversations_userId";
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_credential_id_fkey;

ALTER TABLE conversations DROP COLUMN IF EXISTS user_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS "userId";
ALTER TABLE conversations DROP COLUMN IF EXISTS credential_id;

ALTER TABLE conversations
  ALTER COLUMN "credentialId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_conversations_credentialId" ON conversations("credentialId");

-- =========================
-- messages: keep conversationId, remove conversation_id
-- =========================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversation_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversationId'
  ) THEN
    EXECUTE 'ALTER TABLE messages RENAME COLUMN conversation_id TO "conversationId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'tool_use'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'toolUse'
  ) THEN
    EXECUTE 'ALTER TABLE messages RENAME COLUMN tool_use TO "toolUse"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'tool_result'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'toolResult'
  ) THEN
    EXECUTE 'ALTER TABLE messages RENAME COLUMN tool_result TO "toolResult"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'createdAt'
  ) THEN
    EXECUTE 'ALTER TABLE messages RENAME COLUMN created_at TO "createdAt"';
  END IF;
END $$;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
ALTER TABLE messages DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE messages DROP COLUMN IF EXISTS tool_use;
ALTER TABLE messages DROP COLUMN IF EXISTS tool_result;
ALTER TABLE messages DROP COLUMN IF EXISTS created_at;

ALTER TABLE messages
  ADD CONSTRAINT messages_conversationId_fkey
  FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IDX_messages_conversationId" ON messages("conversationId");
CREATE INDEX IF NOT EXISTS "IDX_messages_createdAt" ON messages("createdAt");
