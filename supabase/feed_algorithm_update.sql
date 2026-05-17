-- Feed Algorithm Update
-- 1. Reduce the priority of the user's own content (affinity_score from 30 to -50)
-- 2. Impressions (seen_penalty) will now be populated correctly by the frontend.

CREATE OR REPLACE FUNCTION get_combined_feed_data(
    p_tab TEXT, 
    p_filter TEXT, 
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_my_id UUID := auth.uid();
    v_following_ids UUID[];
    v_feed JSONB;
    v_stories JSONB;
BEGIN
    -- 1. Obtener IDs que sigues
    SELECT COALESCE(ARRAY_AGG(following_id), ARRAY[]::UUID[]) INTO v_following_ids FROM follows WHERE follower_id = v_my_id;

    -- 2. Construir Feed con Scoring Dinámico
    SELECT jsonb_agg(f) INTO v_feed FROM (
        WITH base_capsules AS (
            SELECT c.*,
                   regexp_replace(c.description, '\[STYLE:[A-Z]+\]', '', 'g') as clean_description,
                   CASE 
                     WHEN c.owner_id = v_my_id THEN -50 -- Lowered from 30 to prevent own content sticking to top
                     WHEN c.owner_id = ANY(v_following_ids) THEN 100 
                     WHEN c.owner_id IN (SELECT following_id FROM follows WHERE follower_id = ANY(v_following_ids)) THEN 50 
                     ELSE 0 
                   END as affinity_score,
                   CASE WHEN c.status = 'sealed' AND c.opens_at < (now() + interval '48 hours') AND c.opens_at > now() THEN 150 ELSE 0 END as hype_score,
                   CASE WHEN c.created_at > (now() - interval '5 days') THEN 100 ELSE 0 END as freshness_score
            FROM capsules c
            WHERE (
                (p_tab = 'following' AND (c.owner_id = ANY(v_following_ids) OR c.owner_id = v_my_id)) OR
                (p_tab = 'explore' AND (c.is_public = true OR c.owner_id = v_my_id) AND (c.owner_id <> v_my_id AND NOT (c.owner_id = ANY(v_following_ids))))
            )
            AND (CASE 
                  WHEN p_filter = 'open' THEN c.status = 'opened'
                  WHEN p_filter = 'closed' THEN c.status = 'sealed'
                  ELSE TRUE
                END)
            AND (NOT EXISTS (SELECT 1 FROM capsule_items ci WHERE ci.capsule_id = c.id AND ci.moderation_status = 'rejected'))
            AND c.created_at > (now() - interval '90 days')
        ),
        activity_raw AS (
            SELECT id AS event_id, id AS capsule_id, 'capsule'::TEXT AS f_type, 'base'::TEXT AS batch_group, created_at AS a_date, owner_id FROM base_capsules
            UNION ALL
            SELECT MIN(ci.id::text)::uuid AS event_id, ci.capsule_id, 'item'::TEXT AS f_type, COALESCE(substring(ci.caption from '!!b:([a-z0-9]+)'), ci.id::text) AS batch_group, MAX(ci.created_at) AS a_date, ci.owner_id
            FROM capsule_items ci 
            JOIN base_capsules bc ON bc.id = ci.capsule_id
            WHERE ci.is_story = FALSE AND ci.media_type IN ('image', 'video')
            GROUP BY ci.capsule_id, ci.owner_id, batch_group
        ),
        activity_scored AS (
            SELECT act.*,
                   CASE 
                     WHEN EXISTS(SELECT 1 FROM feed_impressions WHERE user_id = v_my_id AND capsule_id = act.capsule_id) 
                     THEN -500 
                     ELSE 0 
                   END as seen_penalty,
                   ROW_NUMBER() OVER(PARTITION BY owner_id ORDER BY a_date DESC) as user_post_rank
            FROM activity_raw act
        )
        SELECT 
            (act.f_type || '_' || act.capsule_id::text || '_' || act.batch_group) AS id,
            act.f_type AS feed_type, act.a_date AS activity_date,
            bc.title, bc.clean_description as description, bc.status, bc.opens_at, bc.type, bc.model, bc.chain_id, bc.is_public, bc.cover_url, bc.created_at, bc.id as capsule_id, bc.owner_id,
            prof.profile_data AS profiles,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count,
            COALESCE(li.item_data, jsonb_build_object('media_url', bc.cover_url)) AS latest_item,
            COALESCE(col.collage_data, '[]'::jsonb) AS collage_items,
            (bc.freshness_score + bc.hype_score + bc.affinity_score + act.seen_penalty) as final_score
        FROM activity_scored act
        JOIN base_capsules bc ON bc.id = act.capsule_id
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'is_verified', p.is_verified, 'favorite_color', p.favorite_color) as profile_data
            FROM profiles p WHERE p.id = bc.owner_id
        ) prof ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM likes WHERE capsule_id = bc.id) lks ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM comments WHERE capsule_id = bc.id) cms ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM capsule_items WHERE capsule_id = bc.id AND media_type IN ('image','video') AND NOT is_story) pts ON true
        LEFT JOIN LATERAL (
            SELECT row_to_json(ci2)::jsonb as item_data FROM (
                SELECT id, media_url, media_type, thumbnail_url, content, created_at FROM capsule_items 
                WHERE capsule_id = bc.id AND media_type IN ('image','video') AND is_story = FALSE
                AND moderation_status != 'rejected'
                AND ((act.f_type = 'capsule' AND created_at <= act.a_date) OR (act.f_type = 'item' AND COALESCE(substring(caption from '!!b:([a-z0-9]+)'), id::text) = act.batch_group))
                ORDER BY created_at DESC LIMIT 1
            ) ci2
        ) li ON true
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(sub.t) as collage_data FROM (
                SELECT jsonb_build_object('id', ci3.id, 'media_url', ci3.media_url, 'media_type', ci3.media_type, 'thumbnail_url', ci3.thumbnail_url) AS t, ci3.created_at
                FROM capsule_items ci3 WHERE ci3.capsule_id = bc.id AND ci3.media_type IN ('image','video') AND ci3.is_story = FALSE
                AND ci3.moderation_status != 'rejected'
                AND ((act.f_type = 'capsule' AND ci3.created_at <= act.a_date) OR (act.f_type = 'item' AND COALESCE(substring(ci3.caption from '!!b:([a-z0-9]+)'), ci3.id::text) = act.batch_group))
                ORDER BY ci3.created_at DESC LIMIT 4
            ) sub
        ) col ON true
        WHERE act.user_post_rank <= 3
        ORDER BY final_score DESC, act.a_date DESC
        LIMIT p_limit OFFSET p_offset
    ) f;

    -- 3. Stories
    SELECT jsonb_agg(s) INTO v_stories FROM (
        SELECT i.*, row_to_json(p) as profiles, row_to_json(cap) as capsules, EXISTS(SELECT 1 FROM story_reads WHERE user_id = v_my_id AND story_id = i.id) as is_read
        FROM capsule_items i JOIN profiles p ON p.id = i.owner_id JOIN capsules cap ON cap.id = i.capsule_id
        WHERE i.is_story = true AND i.expires_at > now() ORDER BY i.created_at DESC
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
