-- Dynamic feed ranking, seen-content rotation, and impression recording.

CREATE TABLE IF NOT EXISTS public.feed_impressions (
    user_id UUID NOT NULL,
    capsule_id UUID NOT NULL REFERENCES public.capsules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_impressions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.feed_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own feed impressions" ON public.feed_impressions;
CREATE POLICY "Users can read own feed impressions"
    ON public.feed_impressions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feed impressions" ON public.feed_impressions;
CREATE POLICY "Users can insert own feed impressions"
    ON public.feed_impressions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_capsule
    ON public.feed_impressions(user_id, capsule_id);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_created
    ON public.feed_impressions(user_id, created_at DESC);

DELETE FROM public.feed_impressions a
USING public.feed_impressions b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.capsule_id = b.capsule_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_impressions_user_capsule_unique
    ON public.feed_impressions(user_id, capsule_id);

CREATE OR REPLACE FUNCTION public.record_feed_impressions(
    p_user_id UUID,
    p_capsule_ids UUID[]
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.feed_impressions(user_id, capsule_id)
    SELECT p_user_id, capsule_id
    FROM unnest(p_capsule_ids) AS capsule_id
    WHERE p_user_id IS NOT NULL AND capsule_id IS NOT NULL
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_combined_feed_data(
    p_tab TEXT,
    p_filter TEXT,
    p_limit INTEGER,
    p_offset INTEGER,
    p_seed BIGINT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_my_id UUID := auth.uid();
    v_following_ids UUID[];
    v_feed JSONB;
    v_stories JSONB;
BEGIN
    SELECT COALESCE(ARRAY_AGG(following_id), ARRAY[]::UUID[])
    INTO v_following_ids
    FROM follows
    WHERE follower_id = v_my_id;

    SELECT jsonb_agg(f) INTO v_feed FROM (
        WITH interaction_scores AS (
            SELECT owner_id, SUM(points) AS score
            FROM (
                SELECT c.owner_id, 45 AS points
                FROM likes l
                JOIN capsules c ON c.id = l.capsule_id
                WHERE l.user_id = v_my_id

                UNION ALL

                SELECT c.owner_id, 65 AS points
                FROM comments cm
                JOIN capsules c ON c.id = cm.capsule_id
                WHERE cm.user_id = v_my_id

                UNION ALL

                SELECT c.owner_id, 16 AS points
                FROM feed_impressions fi
                JOIN capsules c ON c.id = fi.capsule_id
                WHERE fi.user_id = v_my_id
            ) x
            WHERE owner_id <> v_my_id
            GROUP BY owner_id
        ),
        mutual_scores AS (
            SELECT f2.following_id AS owner_id, COUNT(*) * 25 AS score
            FROM follows f1
            JOIN follows f2 ON f2.follower_id = f1.following_id
            WHERE f1.follower_id = v_my_id
              AND f2.following_id <> v_my_id
              AND NOT (f2.following_id = ANY(v_following_ids))
            GROUP BY f2.following_id
        ),
        base_capsules AS (
            SELECT c.*,
                   regexp_replace(c.description, '\[STYLE:[A-Z]+\]', '', 'g') AS clean_description,
                   CASE
                     WHEN c.owner_id = v_my_id THEN -80
                     WHEN c.owner_id = ANY(v_following_ids) THEN 120
                     ELSE 0
                   END AS follow_score,
                   COALESCE(i.score, 0) AS interaction_score,
                   COALESCE(m.score, 0) AS mutual_score,
                   CASE WHEN c.status = 'sealed' AND c.opens_at < (now() + interval '48 hours') AND c.opens_at > now() THEN 85 ELSE 0 END AS hype_score,
                   GREATEST(0, 90 - EXTRACT(EPOCH FROM (now() - c.created_at)) / 86400 * 5) AS freshness_score
            FROM capsules c
            LEFT JOIN interaction_scores i ON i.owner_id = c.owner_id
            LEFT JOIN mutual_scores m ON m.owner_id = c.owner_id
            WHERE (
                (p_tab = 'following' AND (c.owner_id = ANY(v_following_ids) OR c.owner_id = v_my_id)) OR
                (p_tab = 'explore' AND c.is_public = true AND c.owner_id <> v_my_id AND NOT (c.owner_id = ANY(v_following_ids)))
            )
            AND (CASE
                  WHEN p_filter = 'open' THEN c.status = 'opened'
                  WHEN p_filter = 'closed' THEN c.status = 'sealed'
                  ELSE TRUE
                END)
            AND NOT EXISTS (
                SELECT 1 FROM feed_impressions fi
                WHERE fi.user_id = v_my_id AND fi.capsule_id = c.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM capsule_items ci
                WHERE ci.capsule_id = c.id AND ci.moderation_status = 'rejected'
            )
            AND c.created_at > (now() - interval '120 days')
        ),
        activity_raw AS (
            SELECT id AS event_id, id AS capsule_id, 'capsule'::TEXT AS f_type, 'base'::TEXT AS batch_group, created_at AS a_date, owner_id
            FROM base_capsules

            UNION ALL

            SELECT MIN(ci.id::text)::uuid AS event_id,
                   ci.capsule_id,
                   'item'::TEXT AS f_type,
                   COALESCE(substring(ci.caption from '!!b:([a-z0-9]+)'), ci.id::text) AS batch_group,
                   MAX(ci.created_at) AS a_date,
                   ci.owner_id
            FROM capsule_items ci
            JOIN base_capsules bc ON bc.id = ci.capsule_id
            WHERE ci.is_story = FALSE
              AND ci.media_type IN ('image', 'video')
              AND ci.moderation_status != 'rejected'
            GROUP BY ci.capsule_id, ci.owner_id, batch_group
        ),
        activity_scored AS (
            SELECT act.*,
                   ROW_NUMBER() OVER(PARTITION BY owner_id ORDER BY a_date DESC) AS user_post_rank
            FROM activity_raw act
        )
        SELECT
            (act.f_type || '_' || act.capsule_id::text || '_' || act.batch_group) AS id,
            act.f_type AS feed_type,
            act.a_date AS activity_date,
            bc.title,
            bc.clean_description AS description,
            bc.status,
            bc.opens_at,
            bc.type,
            bc.model,
            bc.chain_id,
            bc.is_public,
            bc.cover_url,
            bc.created_at,
            bc.id AS capsule_id,
            bc.owner_id,
            prof.profile_data AS profiles,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count,
            COALESCE(li.item_data, jsonb_build_object('media_url', bc.cover_url)) AS latest_item,
            COALESCE(col.collage_data, '[]'::jsonb) AS collage_items,
            (
                bc.freshness_score + bc.hype_score + bc.follow_score + bc.interaction_score + bc.mutual_score +
                LEAST(COALESCE(lks.count, 0), 25) * 2 + LEAST(COALESCE(cms.count, 0), 20) * 3
            ) AS final_score
        FROM activity_scored act
        JOIN base_capsules bc ON bc.id = act.capsule_id
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'is_verified', p.is_verified, 'favorite_color', p.favorite_color) AS profile_data
            FROM profiles p WHERE p.id = bc.owner_id
        ) prof ON true
        LEFT JOIN LATERAL (SELECT count(*) AS count FROM likes WHERE capsule_id = bc.id) lks ON true
        LEFT JOIN LATERAL (SELECT count(*) AS count FROM comments WHERE capsule_id = bc.id) cms ON true
        LEFT JOIN LATERAL (SELECT count(*) AS count FROM capsule_items WHERE capsule_id = bc.id AND media_type IN ('image','video') AND NOT is_story) pts ON true
        LEFT JOIN LATERAL (
            SELECT row_to_json(ci2)::jsonb AS item_data FROM (
                SELECT id, media_url, media_type, thumbnail_url, content, created_at
                FROM capsule_items
                WHERE capsule_id = bc.id
                  AND media_type IN ('image','video')
                  AND is_story = FALSE
                  AND moderation_status != 'rejected'
                  AND ((act.f_type = 'capsule' AND created_at <= act.a_date) OR (act.f_type = 'item' AND COALESCE(substring(caption from '!!b:([a-z0-9]+)'), id::text) = act.batch_group))
                ORDER BY created_at DESC
                LIMIT 1
            ) ci2
        ) li ON true
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(sub.t) AS collage_data FROM (
                SELECT jsonb_build_object('id', ci3.id, 'media_url', ci3.media_url, 'media_type', ci3.media_type, 'thumbnail_url', ci3.thumbnail_url) AS t, ci3.created_at
                FROM capsule_items ci3
                WHERE ci3.capsule_id = bc.id
                  AND ci3.media_type IN ('image','video')
                  AND ci3.is_story = FALSE
                  AND ci3.moderation_status != 'rejected'
                  AND ((act.f_type = 'capsule' AND ci3.created_at <= act.a_date) OR (act.f_type = 'item' AND COALESCE(substring(ci3.caption from '!!b:([a-z0-9]+)'), ci3.id::text) = act.batch_group))
                ORDER BY ci3.created_at DESC
                LIMIT 4
            ) sub
        ) col ON true
        WHERE act.user_post_rank <= 3
        ORDER BY
            final_score DESC,
            md5(act.capsule_id::text || act.batch_group || p_seed::text),
            act.a_date DESC
        LIMIT p_limit OFFSET p_offset
    ) f;

    SELECT jsonb_agg(s) INTO v_stories FROM (
        SELECT i.*, row_to_json(p) AS profiles, row_to_json(cap) AS capsules, EXISTS(SELECT 1 FROM story_reads WHERE user_id = v_my_id AND story_id = i.id) AS is_read
        FROM capsule_items i
        JOIN profiles p ON p.id = i.owner_id
        JOIN capsules cap ON cap.id = i.capsule_id
        WHERE i.is_story = true AND i.expires_at > now()
        ORDER BY i.created_at DESC
    ) s;

    RETURN jsonb_build_object(
        'feed', COALESCE(v_feed, '[]'::jsonb),
        'stories', COALESCE(v_stories, '[]'::jsonb),
        'following_ids', COALESCE(to_jsonb(v_following_ids), '[]'::jsonb),
        'liked_ids', (SELECT COALESCE(jsonb_agg(capsule_id), '[]'::jsonb) FROM likes WHERE user_id = v_my_id),
        'participant_ids', (SELECT COALESCE(jsonb_agg(capsule_id), '[]'::jsonb) FROM capsule_invites WHERE user_id = v_my_id AND status = 'accepted')
    );
END;
$$ LANGUAGE plpgsql STABLE;
