-- Frontend relief indexes
-- Purpose:
-- 1. support the temporary frontend-driven feed/profile/detail paths
-- 2. reduce sequential scans while RPC-heavy paths remain disabled in the clients
-- 3. avoid risky function drops until all active clients have moved off the old RPCs

CREATE INDEX IF NOT EXISTS idx_capsules_owner_updated_at_hot
    ON public.capsules(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsules_public_updated_at_hot
    ON public.capsules(is_public, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsules_status_updated_at_hot
    ON public.capsules(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsule_items_owner_story_created_at_hot
    ON public.capsule_items(owner_id, is_story, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsule_items_capsule_story_created_at_hot
    ON public.capsule_items(capsule_id, is_story, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsule_items_capsule_media_created_at_hot
    ON public.capsule_items(capsule_id, created_at DESC)
    WHERE is_story = FALSE;

CREATE INDEX IF NOT EXISTS idx_capsule_followers_user_capsule_hot
    ON public.capsule_followers(user_id, capsule_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_following_hot
    ON public.follows(follower_id, following_id);

CREATE INDEX IF NOT EXISTS idx_follows_following_follower_hot
    ON public.follows(following_id, follower_id);
