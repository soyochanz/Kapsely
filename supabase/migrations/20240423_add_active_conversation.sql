-- Add active_conversation_id to profiles to track where the user is currently looking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_active_conversation ON profiles(active_conversation_id);
