-- 1. Table for multiple push tokens per user (multi-device support)
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    device_id TEXT, -- Optional, to identify the device
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, token)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);

-- 2. Update profiles table to keep compatibility (optional but recommended)
-- We can keep the push_token column in profiles as the 'latest' one, 
-- but the Edge Function will now use the user_push_tokens table.

-- 3. Function to register a token (handles duplicates and updates last_seen)
CREATE OR REPLACE FUNCTION public.register_push_token(p_user_id UUID, p_token TEXT, p_device_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_push_tokens (user_id, token, device_id, last_seen)
    VALUES (p_user_id, p_token, p_device_id, now())
    ON CONFLICT (user_id, token) 
    DO UPDATE SET 
        last_seen = EXCLUDED.last_seen,
        device_id = COALESCE(EXCLUDED.device_id, public.user_push_tokens.device_id);
    
    -- Also sync to profiles for legacy support
    UPDATE public.profiles SET push_token = p_token WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable RLS on the new table
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tokens"
ON public.user_push_tokens
FOR ALL
USING (auth.uid() = user_id);

-- 5. Add 'is_read' to notifications if missing (it's likely there, but let's be sure)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='is_read') THEN
        ALTER TABLE public.notifications ADD COLUMN is_read BOOLEAN DEFAULT false;
    END IF;
END $$;
