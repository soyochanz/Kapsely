-- Stronger feed rotation for posts the user opens from the feed.
-- Views use normal seen_at/created_at; clicks push the same feed event further down on refresh.

ALTER TABLE public.feed_impressions
    ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_feed_click(
    p_user_id UUID,
    p_capsule_id UUID,
    p_feed_event_id TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.feed_impressions(user_id, capsule_id, feed_event_id, seen_at, created_at, clicked_at, click_count)
    VALUES (
        p_user_id,
        p_capsule_id,
        COALESCE(p_feed_event_id, p_capsule_id::text),
        now() + interval '14 days',
        now() + interval '14 days',
        now(),
        1
    )
    ON CONFLICT (user_id, feed_event_id)
    DO UPDATE SET
        capsule_id = EXCLUDED.capsule_id,
        seen_at = EXCLUDED.seen_at,
        created_at = EXCLUDED.created_at,
        clicked_at = now(),
        click_count = public.feed_impressions.click_count + 1;
END;
$$ LANGUAGE plpgsql;
