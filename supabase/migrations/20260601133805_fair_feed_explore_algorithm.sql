-- Support the lightweight fair feed/explore algorithm without forcing the app
-- back onto the heavier feed RPC path.

CREATE INDEX IF NOT EXISTS idx_likes_user_capsule_hot
    ON public.likes(user_id, capsule_id);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_feed_key_shown_hot
    ON public.feed_impressions(user_id, feed_item_key, shown_at DESC)
    WHERE feed_item_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_event_shown_hot
    ON public.feed_impressions(user_id, feed_event_id, shown_at DESC)
    WHERE feed_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_active_capsule_hot
    ON public.feed_impressions(user_id, capsule_id, shown_at DESC)
    WHERE capsule_id IS NOT NULL
      AND (clicked = TRUE OR opened = TRUE OR watched_seconds >= 3);

CREATE INDEX IF NOT EXISTS idx_capsules_public_updated_hot
    ON public.capsules(updated_at DESC)
    WHERE is_public = TRUE;

CREATE INDEX IF NOT EXISTS idx_capsules_public_owner_updated_hot
    ON public.capsules(owner_id, updated_at DESC)
    WHERE is_public = TRUE;
