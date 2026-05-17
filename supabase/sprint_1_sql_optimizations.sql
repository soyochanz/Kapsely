-- SPRINT 1: SEGURIDAD Y OPTIMIZACIÓN SQL
-- 1. REFACTORIZACIÓN DE get_combined_feed_data CON LATERAL JOINS Y auth.uid()
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
    -- 1. Obtener IDs que sigues (Usando auth.uid())
    SELECT COALESCE(ARRAY_AGG(following_id), ARRAY[]::UUID[]) INTO v_following_ids FROM follows WHERE follower_id = v_my_id;

    -- 2. Construir Feed con Scoring Dinámico
    SELECT jsonb_agg(f) INTO v_feed FROM (
        WITH base_capsules AS (
            SELECT c.*,
                   regexp_replace(c.description, '\[STYLE:[A-Z]+\]', '', 'g') as clean_description,
                   CASE 
                     WHEN c.owner_id = v_my_id THEN 30 
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
            -- LATERAL JOINS PARA OPTIMIZACIÓN
            prof.profile_data AS profiles,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count,
            COALESCE(li.item_data, jsonb_build_object('media_url', bc.cover_url)) AS latest_item,
            COALESCE(col.collage_data, '[]'::jsonb) AS collage_items,
            (bc.freshness_score + bc.hype_score + bc.affinity_score + act.seen_penalty) as final_score
        FROM activity_scored act
        JOIN base_capsules bc ON bc.id = act.capsule_id
        -- Lateral 1: Profile
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'is_verified', p.is_verified, 'favorite_color', p.favorite_color) as profile_data
            FROM profiles p WHERE p.id = bc.owner_id
        ) prof ON true
        -- Lateral 2: Counts
        LEFT JOIN LATERAL (SELECT count(*) as count FROM likes WHERE capsule_id = bc.id) lks ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM comments WHERE capsule_id = bc.id) cms ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM capsule_items WHERE capsule_id = bc.id AND media_type IN ('image','video') AND NOT is_story) pts ON true
        -- Lateral 3: Latest Item
        LEFT JOIN LATERAL (
            SELECT row_to_json(ci2)::jsonb as item_data FROM (
                SELECT id, media_url, media_type, thumbnail_url, content, created_at FROM capsule_items 
                WHERE capsule_id = bc.id AND media_type IN ('image','video') AND is_story = FALSE
                AND moderation_status != 'rejected'
                AND ((act.f_type = 'capsule' AND created_at <= act.a_date) OR (act.f_type = 'item' AND COALESCE(substring(caption from '!!b:([a-z0-9]+)'), id::text) = act.batch_group))
                ORDER BY created_at DESC LIMIT 1
            ) ci2
        ) li ON true
        -- Lateral 4: Collage
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

    -- 3. Stories (Usando auth.uid())
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


-- 2. get_profile_data_unified (CON STICKERS UNIFICADOS Y auth.uid())
CREATE OR REPLACE FUNCTION get_profile_data_unified(
    p_target_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_viewer_id UUID := auth.uid();
    v_profile JSONB;
    v_is_following BOOLEAN;
    v_stories JSONB;
    v_capsules JSONB;
    v_my_reads UUID[];
    v_my_accepted_invites UUID[];
    v_stickers JSONB;
BEGIN
    -- Profile + Followers/Following counts
    SELECT jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'favorite_color', p.favorite_color,
        'favorite_movie', p.favorite_movie,
        'favorite_song', p.favorite_song,
        'birthdate', p.birthdate,
        'is_verified', p.is_verified,
        'is_admin', p.is_admin,
        'created_at', p.created_at,
        'followers_count', (SELECT count(*) FROM follows WHERE following_id = p_target_id),
        'following_count', (SELECT count(*) FROM follows WHERE follower_id = p_target_id)
    ) INTO v_profile
    FROM profiles p WHERE p.id = p_target_id;

    -- Is Following
    SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = v_viewer_id AND following_id = p_target_id) INTO v_is_following;

    -- Stories
    SELECT jsonb_agg(s) INTO v_stories FROM (
        SELECT id, media_url, media_type, thumbnail_url, created_at, expires_at
        FROM capsule_items WHERE owner_id = p_target_id AND is_story = true AND expires_at > now()
        ORDER BY created_at DESC
    ) s;

    -- Capsules (Optimized with Counts)
    SELECT jsonb_agg(c) INTO v_capsules FROM (
        SELECT 
            c.*,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count
        FROM capsules c
        LEFT JOIN LATERAL (SELECT count(*) as count FROM likes WHERE capsule_id = c.id) lks ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM comments WHERE capsule_id = c.id) cms ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM capsule_items WHERE capsule_id = c.id AND media_type IN ('image','video') AND NOT is_story) pts ON true
        WHERE c.owner_id = p_target_id OR c.invited_user_id = p_target_id
        ORDER BY c.created_at DESC
    ) c;

    -- Viewer context
    SELECT ARRAY_AGG(story_id) INTO v_my_reads FROM story_reads WHERE user_id = v_viewer_id;
    SELECT ARRAY_AGG(capsule_id) INTO v_my_accepted_invites FROM capsule_invites WHERE user_id = v_viewer_id AND status = 'accepted';

    -- UNIFICACIÓN: Stickers
    SELECT jsonb_agg(st) INTO v_stickers FROM (
        SELECT ps.*, row_to_json(s) as stickers
        FROM profile_stickers ps
        JOIN stickers s ON s.id = ps.sticker_id
        WHERE ps.user_id = p_target_id
    ) st;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'is_following', v_is_following,
        'stories', COALESCE(v_stories, '[]'::jsonb),
        'capsules', COALESCE(v_capsules, '[]'::jsonb),
        'my_reads', COALESCE(v_my_reads, ARRAY[]::UUID[]),
        'my_accepted_invites', COALESCE(v_my_accepted_invites, ARRAY[]::UUID[]),
        'stickers', COALESCE(v_stickers, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql STABLE;


-- 3. get_capsule_detail_unified (CON auth.uid())
CREATE OR REPLACE FUNCTION get_capsule_detail_unified(
    p_capsule_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_capsule JSONB;
    v_items JSONB;
    v_likes_count BIGINT;
    v_is_liked BOOLEAN;
    v_invites JSONB;
    v_owner_followers_count BIGINT;
    v_is_followed_owner BOOLEAN;
    v_capsule_followers_count BIGINT;
    v_is_followed_capsule BOOLEAN;
BEGIN
    -- Capsule data
    SELECT row_to_json(c)::jsonb INTO v_capsule FROM (
        SELECT c.*, row_to_json(p)::jsonb as profiles
        FROM capsules c
        JOIN profiles p ON p.id = c.owner_id
        WHERE c.id = p_capsule_id
    ) c;

    -- Items
    SELECT jsonb_agg(i) INTO v_items FROM (
        SELECT ci.*, row_to_json(p)::jsonb as profiles
        FROM capsule_items ci
        JOIN profiles p ON p.id = ci.owner_id
        WHERE ci.capsule_id = p_capsule_id
        ORDER BY ci.created_at ASC
    ) i;

    -- Likes
    SELECT count(*) INTO v_likes_count FROM likes WHERE capsule_id = p_capsule_id;
    SELECT EXISTS(SELECT 1 FROM likes WHERE capsule_id = p_capsule_id AND user_id = v_user_id) INTO v_is_liked;

    -- Invites
    SELECT jsonb_agg(inv) INTO v_invites FROM (
        SELECT ci.*, row_to_json(p)::jsonb as profiles
        FROM capsule_invites ci
        JOIN profiles p ON p.id = ci.user_id
        WHERE ci.capsule_id = p_capsule_id
    ) inv;

    -- Follows context
    SELECT count(*) INTO v_owner_followers_count FROM follows WHERE following_id = (SELECT owner_id FROM capsules WHERE id = p_capsule_id);
    SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = v_user_id AND following_id = (SELECT owner_id FROM capsules WHERE id = p_capsule_id)) INTO v_is_followed_owner;
    
    SELECT count(*) INTO v_capsule_followers_count FROM capsule_followers WHERE capsule_id = p_capsule_id;
    SELECT EXISTS(SELECT 1 FROM capsule_followers WHERE user_id = v_user_id AND capsule_id = p_capsule_id) INTO v_is_followed_capsule;

    RETURN jsonb_build_object(
        'capsule', v_capsule,
        'items', COALESCE(v_items, '[]'::jsonb),
        'likes_count', v_likes_count,
        'is_liked', v_is_liked,
        'invites', COALESCE(v_invites, '[]'::jsonb),
        'owner_followers_count', v_owner_followers_count,
        'is_followed_owner', v_is_followed_owner,
        'capsule_followers_count', v_capsule_followers_count,
        'is_followed_capsule', v_is_followed_capsule
    );
END;
$$ LANGUAGE plpgsql STABLE;
