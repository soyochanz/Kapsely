-- Database migration to support capsule followers and notifications for them

-- 1. Create the capsule_followers table
CREATE TABLE IF NOT EXISTS public.capsule_followers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  capsule_id uuid REFERENCES public.capsules(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(capsule_id, user_id)
);

-- 2. Enable RLS
ALTER TABLE public.capsule_followers ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view capsule followers') THEN
        CREATE POLICY "Users can view capsule followers" ON public.capsule_followers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can follow capsules') THEN
        CREATE POLICY "Authenticated users can follow capsules" ON public.capsule_followers FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can unfollow capsules') THEN
        CREATE POLICY "Users can unfollow capsules" ON public.capsule_followers FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- 4. Notification triggers for follows (Optional: logic handled in app code)
-- But we need to ensure the notification type exists if there's a constraint, 
-- though it seems notifications are just a table insertion.

-- 5. Add a function to check if user follows a capsule and get totals efficiently
CREATE OR REPLACE FUNCTION public.get_capsule_follow_stats(p_capsule_id uuid, p_user_id uuid)
RETURNS TABLE (follower_count bigint, is_followed boolean) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT count(*) FROM public.capsule_followers WHERE capsule_id = p_capsule_id),
    EXISTS (SELECT 1 FROM public.capsule_followers WHERE capsule_id = p_capsule_id AND user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
