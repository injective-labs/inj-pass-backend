-- Migration: Create conversations and messages tables for AI chat history backup
-- Enables cross-device synchronization of chat history

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  model VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for conversations
CREATE INDEX IF NOT EXISTS "IDX_conversations_user_id" ON conversations(user_id);
CREATE INDEX IF NOT EXISTS "IDX_conversations_updated_at" ON conversations(updated_at);

-- Create indexes for messages
CREATE INDEX IF NOT EXISTS "IDX_messages_conversation_id" ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS "IDX_messages_created_at" ON messages(created_at);

-- Add comments
COMMENT ON TABLE conversations IS 'AI chat conversation metadata';
COMMENT ON COLUMN conversations.id IS 'Unique conversation ID (UUID)';
COMMENT ON COLUMN conversations.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN conversations.title IS 'Conversation title';
COMMENT ON COLUMN conversations.model IS 'AI model used in this conversation';

COMMENT ON TABLE messages IS 'Individual messages in AI chat conversations';
COMMENT ON COLUMN messages.conversation_id IS 'Foreign key to conversations table';
COMMENT ON COLUMN messages.role IS 'Message role: user or assistant';
COMMENT ON COLUMN messages.content IS 'Message content';
