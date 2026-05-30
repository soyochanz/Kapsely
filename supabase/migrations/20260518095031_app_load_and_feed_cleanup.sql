-- App load and feed cleanup:
-- - remove duplicate indexes that add write cost
-- - add missing hot-path indexes for feed/profile/notifications
-- - centralize follow suggestions into a single RPC

-- Duplicate indexes on hot tables
DROP INDEX IF EXISTS public.idx_capsule_invites_user_id_status;
DROP INDEX IF EXISTS public.idx_capsule_items_capsule;
DROP INDEX IF EXISTS public.idx_capsule_items_created;
DROP INDEX IF EXISTS public.idx_capsules_created;
DROP INDEX IF EXISTS public.capsules_owner_id_idx;
DROP INDEX IF EXISTS public.idx_capsules_owner;
DROP INDEX IF EXISTS public.idx_comments_capsule;
DROP INDEX IF EXISTS public.idx_follows_follower;
DROP INDEX IF EXISTS public.idx_follows_following;
DROP INDEX IF EXISTS public.item_likes_item_idx;
DROP INDEX IF EXISTS public.item_likes_user_idx;
DROP INDEX IF EXISTS public.idx_likes_capsule;
DROP INDEX IF EXISTS public.idx_likes_user;
DROP INDEX IF EXISTS public.idx_messages_conversation_created;
DROP INDEX IF EXISTS public.idx_notifications_user_created_at;

-- Missing / hot-path indexes
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id
    ON public.blocks(blocked_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_created_at
    ON public.comments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_shown_at
    ON public.feed_impressions(user_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created_at
    ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_sender_type_capsule
    ON public.notifications(sender_id, type, capsule_id);

CREATE INDEX IF NOT EXISTS idx_capsule_items_location_owner_recent
    ON public.capsule_items(location_name, created_at DESC, owner_id)
    WHERE location_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capsule_items_owner_recent_with_location
    ON public.capsule_items(owner_id, created_at DESC)
    WHERE location_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_models_active_created_at
    ON public.models(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_configs_model_id_hot
    ON public.model_configs(model_id);

CREATE INDEX IF NOT EXISTS idx_model_chain_configs_model_id_hot
    ON public.model_chain_configs(model_id);

CREATE INDEX IF NOT EXISTS idx_chains_active_created_at
    ON public.chains(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drops_active_start_date
    ON public.drops(is_active, start_date DESC);

CREATE OR REPLACE FUNCTION public.get_follow_suggestions(
    p_limit INTEGER DEFAULT 10,
    p_seed BIGINT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;

    WITH
    my_following AS (
        SELECT following_id
        FROM public.follows
        WHERE follower_id = v_user_id
    ),
    my_followers AS (
        SELECT follower_id
        FROM public.follows
        WHERE following_id = v_user_id
    ),
    recent_locations AS (
        SELECT DISTINCT location_name
        FROM (
            SELECT location_name
            FROM public.capsule_items
            WHERE owner_id = v_user_id
              AND location_name IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 12
        ) recent_location_rows
    ),
    candidate_reasons AS (
        SELECT follower_id AS candidate_id, 55::DOUBLE PRECISION AS points, 'follows_you'::TEXT AS reason
        FROM my_followers

        UNION ALL

        SELECT f2.following_id AS candidate_id, 45::DOUBLE PRECISION AS points, 'mutual_friends'::TEXT AS reason
        FROM my_following mf
        JOIN public.follows f2
          ON f2.follower_id = mf.following_id

        UNION ALL

        SELECT c.owner_id AS candidate_id, 40::DOUBLE PRECISION AS points, 'liked_content'::TEXT AS reason
        FROM public.likes l
        JOIN public.capsules c ON c.id = l.capsule_id
        WHERE l.user_id = v_user_id
          AND c.owner_id IS NOT NULL
          AND c.owner_id <> v_user_id

        UNION ALL

        SELECT c.owner_id AS candidate_id, 50::DOUBLE PRECISION AS points, 'commented_content'::TEXT AS reason
        FROM public.comments cm
        JOIN public.capsules c ON c.id = cm.capsule_id
        WHERE cm.user_id = v_user_id
          AND c.owner_id IS NOT NULL
          AND c.owner_id <> v_user_id
          AND cm.created_at > now() - interval '120 days'

        UNION ALL

        SELECT c.owner_id AS candidate_id, 18::DOUBLE PRECISION AS points, 'seen_content'::TEXT AS reason
        FROM public.feed_impressions fi
        JOIN public.capsules c ON c.id = fi.capsule_id
        WHERE fi.user_id = v_user_id
          AND c.owner_id IS NOT NULL
          AND c.owner_id <> v_user_id
          AND fi.shown_at > now() - interval '60 days'
          AND (fi.clicked = TRUE OR fi.opened = TRUE OR fi.watched_seconds >= 3)

        UNION ALL

        SELECT c.owner_id AS candidate_id, 60::DOUBLE PRECISION AS points, 'followed_capsule'::TEXT AS reason
        FROM public.capsule_followers cf
        JOIN public.capsules c ON c.id = cf.capsule_id
        WHERE cf.user_id = v_user_id
          AND c.owner_id IS NOT NULL
          AND c.owner_id <> v_user_id

        UNION ALL

        SELECT ci.owner_id AS candidate_id, 16::DOUBLE PRECISION AS points, 'same_location'::TEXT AS reason
        FROM recent_locations rl
        JOIN public.capsule_items ci
          ON ci.location_name = rl.location_name
        WHERE ci.owner_id <> v_user_id
          AND ci.location_name IS NOT NULL
          AND ci.created_at > now() - interval '120 days'
    ),
    filtered_candidates AS (
        SELECT cr.*
        FROM candidate_reasons cr
        WHERE cr.candidate_id IS NOT NULL
          AND cr.candidate_id <> v_user_id
          AND NOT EXISTS (
              SELECT 1
              FROM my_following mf
              WHERE mf.following_id = cr.candidate_id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.blocks b
              WHERE (b.blocker_id = v_user_id AND b.blocked_id = cr.candidate_id)
                 OR (b.blocked_id = v_user_id AND b.blocker_id = cr.candidate_id)
          )
    ),
    reason_rank AS (
        SELECT
            candidate_id,
            reason,
            SUM(points) AS reason_score,
            ROW_NUMBER() OVER (
                PARTITION BY candidate_id
                ORDER BY SUM(points) DESC, reason ASC
            ) AS rn
        FROM filtered_candidates
        GROUP BY candidate_id, reason
    ),
    scored AS (
        SELECT
            p.id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.favorite_color,
            p.is_verified,
            COALESCE(rr.reason, 'popular') AS reason,
            (
                SUM(fc.points)
                + CASE WHEN p.is_verified THEN 8 ELSE 0 END
                + ((abs(hashtext(p.id::TEXT || ':' || p_seed::TEXT)) % 900)::DOUBLE PRECISION / 100.0)
            )::DOUBLE PRECISION AS score
        FROM filtered_candidates fc
        JOIN public.profiles p ON p.id = fc.candidate_id
        LEFT JOIN reason_rank rr
          ON rr.candidate_id = fc.candidate_id
         AND rr.rn = 1
        GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.favorite_color, p.is_verified, rr.reason
    )
    SELECT COALESCE(
        jsonb_agg(to_jsonb(s) ORDER BY s.score DESC, s.display_name ASC NULLS LAST, s.username ASC NULLS LAST),
        '[]'::JSONB
    )
    INTO v_result
    FROM (
        SELECT *
        FROM scored
        ORDER BY score DESC, display_name ASC NULLS LAST, username ASC NULLS LAST
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 20))
    ) s;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;
