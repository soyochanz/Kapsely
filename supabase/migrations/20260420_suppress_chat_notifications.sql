-- Migration to suppress capsule_chat notifications and ensure explore feed discovery
-- 1. Drop any existing triggers that might be creating notifications for capsule_chat
-- (Since trigger names vary, we attempt to drop common names if they exist)

DO $$ 
BEGIN
    -- Drop trigger if it exists on capsule_chat
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_capsule_chat_insert') THEN
        DROP TRIGGER on_capsule_chat_insert ON public.capsule_chat;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_capsule_chat_notification') THEN
        DROP TRIGGER tr_capsule_chat_notification ON public.capsule_chat;
    END IF;
END $$;

-- 2. Update the get_explore_feed RPC to ensure followed users are strictly excluded
-- (This is a re-application of the discovery logic to ensure it's locked in)

CREATE OR REPLACE FUNCTION public.get_explore_feed(
    req_user_id  UUID,
    req_filter   TEXT    DEFAULT 'all',
    req_limit    INT     DEFAULT 15,
    req_offset   INT     DEFAULT 0
)
RETURNS TABLE (
    id                  UUID,
    created_at          TIMESTAMPTZ,
    item_id             UUID,
    capsule_id          UUID,
    feed_type           TEXT,
    owner_id            UUID,
    activity_date       TIMESTAMPTZ,
    actual_created_at   TIMESTAMPTZ,
    title               TEXT,
    description         TEXT,
    status              TEXT,
    opens_at            TIMESTAMPTZ,
    type                TEXT,
    model               TEXT,
    chain_id            TEXT,
    is_public           BOOLEAN,
    cover_url           TEXT,
    profiles            JSONB,
    likes_count         BIGINT,
    comments_count      BIGINT,
    posts_count         BIGINT,
    latest_item         JSONB,
    collage_items       JSONB,
    is_liked            BOOLEAN,
    is_commented        BOOLEAN,
    is_followed         BOOLEAN,
    affinity_score      NUMERIC,
    momentum_score      NUMERIC,
    event_horizon_score NUMERIC,
    recency_score       NUMERIC,
    engagement_score    NUMERIC,
    seen_penalty        NUMERIC,
    discovery_bonus     NUMERIC,
    total_score         NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH
    -- All public capsules NOT owned by user and NOT followed by user
    base_capsules AS (
        SELECT c.*
        FROM capsules c
        WHERE c.is_public = TRUE
          AND c.owner_id <> req_user_id
          -- CRITICAL: Exclude followed users for discovery
          AND c.owner_id NOT IN (SELECT following_id FROM follows WHERE follower_id = req_user_id)
          AND (
              req_filter = 'all'
              OR (req_filter = 'closed' AND c.status = 'sealed')
              OR (req_filter = 'open'   AND c.status = 'opened')
          )
    ),
    -- Activity Union (Capsule creation + Item uploads)
    activity AS (
        SELECT 
            c.id AS event_id,
            c.id AS capsule_id,
            'capsule'::TEXT AS f_type,
            NULL::TEXT AS batch_group,
            c.created_at AS a_date,
            c.owner_id
        FROM base_capsules c
        
        UNION ALL
        
        SELECT
            MIN(ci.id::text)::uuid AS event_id,
            ci.capsule_id,
            'item'::TEXT AS f_type,
            COALESCE(substring(ci.caption from '!!b:([a-z0-9]+)'), ci.id::text) AS batch_group,
            MAX(ci.created_at) AS a_date,
            ci.owner_id
        FROM capsule_items ci
        JOIN base_capsules bc ON bc.id = ci.capsule_id
        WHERE ci.is_story = FALSE
          AND ci.media_type IN ('image', 'video')
        GROUP BY ci.capsule_id, ci.owner_id, batch_group
    ),
    -- Mutual follows check (for affinity scoring even in explore)
    mutual_follows AS (
        SELECT f1.following_id AS user_id
        FROM follows f1
        JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = req_user_id
        WHERE f1.follower_id = req_user_id
    ),
    scored AS (
        SELECT
            act.event_id                                            AS id,
            bc.created_at,
            act.event_id                                            AS item_id,
            bc.id                                                   AS capsule_id,
            act.f_type                                              AS feed_type,
            bc.owner_id,
            act.a_date                                              AS activity_date,
            bc.created_at                                           AS actual_created_at,
            bc.title,
            bc.description,
            bc.status,
            bc.opens_at,
            bc.type,
            bc.model,
            bc.chain_id,
            bc.is_public,
            bc.cover_url,
            -- Profile info
            (SELECT jsonb_build_object(
                'username',     p.username,
                'display_name', p.display_name,
                'avatar_url',   p.avatar_url,
                'is_verified',  p.is_verified
            ) FROM profiles p WHERE p.id = bc.owner_id)           AS profiles,
            -- Counts
            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.capsule_id = bc.id), 0)                   AS likes_count,
            COALESCE((SELECT COUNT(*) FROM comments c WHERE c.capsule_id = bc.id), 0)                AS comments_count,
            (SELECT COUNT(*) FROM capsule_items ci3 WHERE ci3.capsule_id = bc.id AND ci3.media_type IN ('image','video') AND NOT ci3.is_story) AS posts_count,
            -- Latest item
            (
                SELECT jsonb_build_object(
                    'id',            ci2.id,
                    'media_url',     ci2.media_url,
                    'media_type',    ci2.media_type,
                    'thumbnail_url', ci2.thumbnail_url,
                    'content',       ci2.content,
                    'created_at',    ci2.created_at
                )
                FROM capsule_items ci2
                WHERE ci2.capsule_id = bc.id
                  AND ci2.media_type IN ('image','video')
                  AND ci2.is_story = FALSE
                  AND (
                      (act.f_type = 'capsule' AND ci2.created_at <= act.a_date)
                      OR (act.f_type = 'item' AND COALESCE(substring(ci2.caption from '!!b:([a-z0-9]+)'), ci2.id::text) = act.batch_group)
                  )
                ORDER BY ci2.created_at DESC
                LIMIT 1
            ) AS latest_item,
            -- Collage
            (
                SELECT jsonb_agg(sub.t ORDER BY sub.created_at DESC)
                FROM (
                    SELECT jsonb_build_object(
                        'id',            ci3.id,
                        'media_url',     ci3.media_url,
                        'media_type',    ci3.media_type,
                        'thumbnail_url', ci3.thumbnail_url
                    ) AS t, ci3.created_at
                    FROM capsule_items ci3
                    WHERE ci3.capsule_id = bc.id
                      AND ci3.media_type IN ('image','video')
                      AND ci3.is_story = FALSE
                      AND (
                          (act.f_type = 'capsule' AND ci3.created_at <= act.a_date)
                          OR (act.f_type = 'item' AND COALESCE(substring(ci3.caption from '!!b:([a-z0-9]+)'), ci3.id::text) = act.batch_group)
                      )
                    ORDER BY ci3.created_at DESC
                    LIMIT 4
                ) sub
            ) AS collage_items,
            -- Per-user flags
            EXISTS(SELECT 1 FROM likes l2 WHERE l2.capsule_id = bc.id AND l2.user_id = req_user_id) AS is_liked,
            EXISTS(SELECT 1 FROM comments c2 WHERE c2.capsule_id = bc.id AND c2.user_id = req_user_id) AS is_commented,
            FALSE AS is_followed, -- Always false due to exclusion logic
            -- Affinity
            CASE WHEN EXISTS(SELECT 1 FROM mutual_follows mf WHERE mf.user_id = bc.owner_id) THEN 25.0 ELSE 0.0 END AS affinity_score,
            0.0::NUMERIC AS momentum_score,
            -- Event horizon
            CASE WHEN bc.status = 'sealed' AND bc.opens_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours' THEN 15.0 ELSE 0.0 END AS event_horizon_score,
            -- Recency score
            GREATEST(0.0, 100.0 * EXP(-0.004 *
                EXTRACT(EPOCH FROM (NOW() - act.a_date) / 3600.0)
            ))                                                       AS recency_score,
            -- Engagement
            LEAST(60.0, COALESCE((SELECT COUNT(*) FROM likes l3 WHERE l3.capsule_id = bc.id), 0) * 3.0
                       + COALESCE((SELECT COUNT(*) FROM comments c3 WHERE c3.capsule_id = bc.id), 0) * 5.0) AS engagement_score,
            -- Seen penalty
            CASE WHEN EXISTS(SELECT 1 FROM feed_impressions fi WHERE fi.user_id = req_user_id AND fi.capsule_id = bc.id) THEN -40.0 ELSE 0.0 END AS seen_penalty,
            -- Discovery bonus
            CASE WHEN act.f_type = 'item' THEN 20.0 ELSE 5.0 END AS discovery_bonus
        FROM activity act
        JOIN base_capsules bc ON bc.id = act.capsule_id
    )
    SELECT
        s.id, s.created_at, s.item_id, s.capsule_id, s.feed_type,
        s.owner_id, s.activity_date, s.actual_created_at,
        s.title, s.description, s.status, s.opens_at,
        s.type, s.model, s.chain_id, s.is_public, s.cover_url,
        s.profiles,
        s.likes_count, s.comments_count, s.posts_count,
        s.latest_item, s.collage_items,
        s.is_liked, s.is_commented, s.is_followed,
        s.affinity_score, s.momentum_score, s.event_horizon_score,
        s.recency_score, s.engagement_score, s.seen_penalty, s.discovery_bonus,
        (s.affinity_score + s.event_horizon_score + s.recency_score
         + s.engagement_score + s.seen_penalty + s.discovery_bonus) AS total_score
    FROM scored s
    ORDER BY s.activity_date DESC, total_score DESC
    LIMIT  req_limit
    OFFSET req_offset;
END;
$$;
