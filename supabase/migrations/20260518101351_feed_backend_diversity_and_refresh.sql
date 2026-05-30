DROP FUNCTION IF EXISTS public.get_combined_feed_data_v2(
    TEXT,
    TEXT,
    INTEGER,
    INTEGER,
    BIGINT,
    TEXT,
    TEXT,
    DOUBLE PRECISION,
    TIMESTAMPTZ,
    TEXT
);

CREATE OR REPLACE FUNCTION public.get_combined_feed_data_v2(
    p_tab TEXT,
    p_filter TEXT,
    p_limit INTEGER,
    p_offset INTEGER DEFAULT 0,
    p_seed BIGINT DEFAULT 0,
    p_refresh_mode TEXT DEFAULT 'initial_load',
    p_session_id TEXT DEFAULT NULL,
    p_cursor_score DOUBLE PRECISION DEFAULT NULL,
    p_cursor_activity_date TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_base JSONB;
    v_feed JSONB := '[]'::JSONB;
    v_candidate_limit INTEGER := LEAST(
        GREATEST(
            COALESCE(p_limit, 15) *
            CASE
                WHEN p_refresh_mode = 'pull_to_refresh' THEN 4
                ELSE 3
            END,
            24
        ),
        72
    );
BEGIN
    v_base := public.get_combined_feed_data(
        p_tab,
        p_filter,
        v_candidate_limit,
        p_offset,
        p_seed,
        p_refresh_mode,
        p_session_id,
        p_cursor_score,
        p_cursor_activity_date,
        p_cursor_id
    );

    WITH RECURSIVE base_feed AS (
        SELECT
            elem.value AS raw,
            elem.ordinality AS ordinality
        FROM jsonb_array_elements(COALESCE(v_base->'feed', '[]'::JSONB)) WITH ORDINALITY AS elem(value, ordinality)
    ),
    boundary AS (
        SELECT
            COALESCE((raw->>'cursor_score')::DOUBLE PRECISION, (raw->>'final_score')::DOUBLE PRECISION, 0) AS cursor_score,
            COALESCE(
                NULLIF(raw->>'cursor_activity_date', '')::TIMESTAMPTZ,
                NULLIF(raw->>'activity_date', '')::TIMESTAMPTZ,
                NULLIF(raw->>'created_at', '')::TIMESTAMPTZ,
                now()
            ) AS cursor_activity_date,
            COALESCE(raw->>'cursor_id', raw->>'feed_item_key', raw->>'feed_event_id', raw->>'id') AS cursor_id
        FROM base_feed
        ORDER BY ordinality DESC
        LIMIT 1
    ),
    normalized AS (
        SELECT
            bf.raw,
            bf.ordinality,
            COALESCE(bf.raw->>'feed_item_key', bf.raw->>'feed_event_id', bf.raw->>'id') AS feed_item_key,
            NULLIF(bf.raw->>'capsule_id', '')::UUID AS capsule_id,
            NULLIF(COALESCE(bf.raw->>'owner_id', bf.raw->>'capsule_owner_id'), '')::UUID AS owner_id,
            COALESCE(bf.raw->>'event_type', bf.raw->>'feed_type', 'capsule_created') AS event_type,
            COALESCE(bf.raw->>'status', 'opened') AS status,
            COALESCE((bf.raw->>'is_followed_capsule')::BOOLEAN, FALSE) AS is_followed_capsule,
            COALESCE((bf.raw->>'has_seen')::BOOLEAN, FALSE) AS has_seen,
            COALESCE((bf.raw->>'final_score')::DOUBLE PRECISION, 0) AS base_score,
            COALESCE(
                NULLIF(bf.raw->>'activity_date', '')::TIMESTAMPTZ,
                NULLIF(bf.raw->>'created_at', '')::TIMESTAMPTZ,
                now()
            ) AS activity_date,
            GREATEST(COALESCE((bf.raw->>'likes_count')::INTEGER, 0), 0) AS likes_count,
            GREATEST(COALESCE((bf.raw->>'comments_count')::INTEGER, 0), 0) AS comments_count,
            GREATEST(COALESCE((bf.raw->>'posts_count')::INTEGER, 0), 0) AS posts_count,
            GREATEST(COALESCE((bf.raw->>'capsule_followers_count')::INTEGER, 0), 0) AS capsule_followers_count,
            COALESCE(NULLIF(COALESCE(bf.raw->>'owner_id', bf.raw->>'capsule_owner_id'), ''), 'no-actor:' || COALESCE(bf.raw->>'feed_item_key', bf.raw->>'id')) AS owner_key,
            COALESCE(NULLIF(bf.raw->>'capsule_id', ''), 'no-capsule:' || COALESCE(bf.raw->>'feed_item_key', bf.raw->>'id')) AS capsule_key
        FROM base_feed bf
    ),
    deduped_keys AS (
        SELECT *
        FROM (
            SELECT
                n.*,
                ROW_NUMBER() OVER (
                    PARTITION BY n.feed_item_key
                    ORDER BY n.base_score DESC, n.activity_date DESC, n.ordinality ASC
                ) AS key_rank
            FROM normalized n
        ) ranked
        WHERE ranked.key_rank = 1
    ),
    rescored AS (
        SELECT
            dk.*,
            (
                dk.base_score
                + CASE dk.event_type
                    WHEN 'capsule_opened' THEN 28
                    WHEN 'birthday' THEN 18
                    WHEN 'item_batch_added' THEN 14
                    WHEN 'old_unseen_capsule' THEN 12
                    WHEN 'opening_soon' THEN 10
                    WHEN 'capsule_created' THEN 8
                    WHEN 'capsule_commented' THEN 5
                    WHEN 'recommendation' THEN CASE WHEN p_tab = 'following' THEN -38 ELSE 10 END
                    ELSE 0
                  END
                + CASE
                    WHEN dk.is_followed_capsule THEN 24
                    ELSE 0
                  END
                + CASE
                    WHEN dk.status = 'opened' AND dk.posts_count > 0 THEN LEAST(18, dk.posts_count * 1.8)
                    WHEN dk.status = 'sealed' AND NOT dk.is_followed_capsule THEN -14
                    ELSE 0
                  END
                + LEAST(18, dk.likes_count * 0.8 + dk.comments_count * 2.2 + dk.capsule_followers_count * 1.4)
                + CASE
                    WHEN p_refresh_mode = 'pull_to_refresh' AND NOT dk.has_seen THEN 24
                    WHEN NOT dk.has_seen THEN 6
                    ELSE 0
                  END
                - CASE
                    WHEN p_refresh_mode = 'pull_to_refresh' AND dk.has_seen THEN 220
                    WHEN dk.has_seen THEN 55
                    ELSE 0
                  END
                + ((ABS(HASHTEXT(COALESCE(p_session_id, '') || ':' || dk.feed_item_key || ':' || p_seed::TEXT || ':v2')) % 700)::DOUBLE PRECISION / 100.0)
            )::DOUBLE PRECISION AS adjusted_score
        FROM deduped_keys dk
    ),
    one_per_capsule AS (
        SELECT *
        FROM (
            SELECT
                rs.*,
                ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN rs.capsule_id IS NULL THEN rs.feed_item_key ELSE rs.capsule_id::TEXT END
                    ORDER BY rs.adjusted_score DESC, rs.activity_date DESC, rs.feed_item_key ASC
                ) AS capsule_rank
            FROM rescored rs
        ) ranked
        WHERE ranked.capsule_id IS NULL OR ranked.capsule_rank = 1
    ),
    pool AS (
        SELECT *
        FROM one_per_capsule
        ORDER BY adjusted_score DESC, activity_date DESC, feed_item_key ASC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 15) * 5, 36), 120)
    ),
    picked AS (
        SELECT
            1 AS position,
            p.feed_item_key,
            p.raw,
            p.owner_key,
            p.capsule_key,
            p.status,
            p.event_type,
            p.is_followed_capsule,
            p.adjusted_score,
            p.adjusted_score AS chosen_score,
            ARRAY[p.feed_item_key]::TEXT[] AS picked_keys,
            ARRAY[p.owner_key]::TEXT[] AS actor_history,
            ARRAY[p.capsule_key]::TEXT[] AS capsule_history,
            ARRAY[p.status]::TEXT[] AS status_history,
            ARRAY[p.event_type]::TEXT[] AS event_history
        FROM pool p
        ORDER BY p.adjusted_score DESC, p.activity_date DESC, p.feed_item_key ASC
        LIMIT 1

        UNION ALL

        SELECT
            prev.position + 1 AS position,
            nxt.feed_item_key,
            nxt.raw,
            nxt.owner_key,
            nxt.capsule_key,
            nxt.status,
            nxt.event_type,
            nxt.is_followed_capsule,
            nxt.adjusted_score,
            nxt.pick_score AS chosen_score,
            prev.picked_keys || nxt.feed_item_key,
            prev.actor_history || nxt.owner_key,
            prev.capsule_history || nxt.capsule_key,
            prev.status_history || nxt.status,
            prev.event_history || nxt.event_type
        FROM picked prev
        JOIN LATERAL (
            SELECT
                candidate.*,
                (
                    candidate.adjusted_score
                    - CASE
                        WHEN candidate.owner_key = prev.actor_history[array_length(prev.actor_history, 1)] THEN 160
                        ELSE 0
                      END
                    - CASE
                        WHEN candidate.capsule_key = prev.capsule_history[array_length(prev.capsule_history, 1)] THEN 260
                        ELSE 0
                      END
                    - CASE
                        WHEN candidate.owner_key <> '' AND (
                            SELECT COUNT(*)
                            FROM unnest(prev.actor_history) AS actor(key)
                            WHERE actor.key = candidate.owner_key
                        ) >= CASE WHEN candidate.is_followed_capsule THEN 2 ELSE 1 END THEN 70
                        ELSE 0
                      END
                    - CASE
                        WHEN candidate.status = 'sealed'
                             AND NOT candidate.is_followed_capsule
                             AND prev.status_history[array_length(prev.status_history, 1)] = 'sealed' THEN 40
                        ELSE 0
                      END
                    - CASE
                        WHEN candidate.status = 'sealed'
                             AND NOT candidate.is_followed_capsule
                             AND (
                                SELECT COUNT(*)
                                FROM unnest(prev.status_history) AS st(value)
                                WHERE st.value = 'sealed'
                             ) >= GREATEST(2, CEIL(COALESCE(p_limit, 15) * 0.35)::INTEGER) THEN 95
                        ELSE 0
                      END
                    - CASE
                        WHEN candidate.event_type = 'birthday'
                             AND EXISTS (
                                SELECT 1
                                FROM unnest(prev.event_history) AS ev(value)
                                WHERE ev.value = 'birthday'
                             ) THEN 120
                        ELSE 0
                      END
                    - CASE
                        WHEN p_tab = 'following'
                             AND prev.position < 5
                             AND candidate.event_type = 'recommendation' THEN 180
                        ELSE 0
                      END
                    + CASE
                        WHEN candidate.is_followed_capsule THEN 18
                        ELSE 0
                      END
                )::DOUBLE PRECISION AS pick_score
            FROM pool candidate
            WHERE NOT candidate.feed_item_key = ANY(prev.picked_keys)
            ORDER BY pick_score DESC, candidate.adjusted_score DESC, candidate.activity_date DESC, candidate.feed_item_key ASC
            LIMIT 1
        ) nxt ON prev.position < LEAST(GREATEST(COALESCE(p_limit, 15), 1), 30)
    ),
    ranked_feed AS (
        SELECT
            p.position,
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            p.raw,
                            '{final_score}',
                            to_jsonb(ROUND(p.chosen_score::NUMERIC, 4)),
                            TRUE
                        ),
                        '{backend_diversified_score}',
                        to_jsonb(ROUND(p.chosen_score::NUMERIC, 4)),
                        TRUE
                    ),
                    '{cursor_score}',
                    to_jsonb(COALESCE(b.cursor_score, ROUND(p.chosen_score::NUMERIC, 4)::DOUBLE PRECISION)),
                    TRUE
                ),
                '{cursor_activity_date}',
                to_jsonb(COALESCE(b.cursor_activity_date, now())),
                TRUE
            ) || jsonb_build_object(
                'cursor_id', COALESCE(b.cursor_id, p.feed_item_key)
            ) AS item
        FROM picked p
        CROSS JOIN boundary b
        ORDER BY p.position ASC
    )
    SELECT COALESCE(jsonb_agg(rf.item ORDER BY rf.position), '[]'::JSONB)
    INTO v_feed
    FROM ranked_feed rf;

    RETURN jsonb_set(COALESCE(v_base, '{}'::JSONB), '{feed}', COALESCE(v_feed, '[]'::JSONB), TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_data_unified(
    p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_viewer_id UUID := auth.uid();
    v_profile JSONB;
    v_is_following BOOLEAN := FALSE;
    v_stories JSONB;
    v_capsules JSONB;
    v_my_reads UUID[];
    v_my_accepted_invites UUID[];
    v_stickers JSONB;
BEGIN
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
        'followers_count', (SELECT COUNT(*) FROM public.follows WHERE following_id = p_target_id),
        'following_count', (SELECT COUNT(*) FROM public.follows WHERE follower_id = p_target_id)
    )
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_target_id;

    IF v_profile IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_viewer_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.follows
            WHERE follower_id = v_viewer_id
              AND following_id = p_target_id
        )
        INTO v_is_following;
    END IF;

    SELECT COALESCE(jsonb_agg(s ORDER BY s.created_at DESC), '[]'::JSONB)
    INTO v_stories
    FROM (
        SELECT
            id,
            media_url,
            media_type,
            thumbnail_url,
            created_at,
            expires_at
        FROM public.capsule_items
        WHERE owner_id = p_target_id
          AND is_story = TRUE
          AND expires_at > now()
          AND moderation_status <> 'rejected'
    ) s;

    SELECT COALESCE(jsonb_agg(c ORDER BY c.created_at DESC), '[]'::JSONB)
    INTO v_capsules
    FROM (
        WITH accessible_capsules AS (
            SELECT c.id
            FROM public.capsules c
            WHERE c.owner_id = p_target_id
               OR c.invited_user_id = p_target_id

            UNION

            SELECT ci.capsule_id
            FROM public.capsule_invites ci
            WHERE ci.user_id = p_target_id
              AND ci.status = 'accepted'
        )
        SELECT
            c.*,
            COALESCE(inv.cover_url, c.cover_url) AS effective_cover_url,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count,
            COALESCE(media.items, '[]'::JSONB) AS fallback_media
        FROM public.capsules c
        JOIN accessible_capsules ac ON ac.id = c.id
        LEFT JOIN public.capsule_invites inv
          ON inv.capsule_id = c.id
         AND inv.user_id = p_target_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS count
            FROM public.likes
            WHERE capsule_id = c.id
        ) lks ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS count
            FROM public.comments
            WHERE capsule_id = c.id
        ) cms ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS count
            FROM public.capsule_items
            WHERE capsule_id = c.id
              AND media_type IN ('image', 'video')
              AND is_story = FALSE
              AND moderation_status <> 'rejected'
        ) pts ON TRUE
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', ci.id,
                    'media_url', ci.media_url,
                    'thumbnail_url', ci.thumbnail_url,
                    'media_type', ci.media_type,
                    'created_at', ci.created_at
                )
                ORDER BY ci.created_at DESC
            ) AS items
            FROM (
                SELECT
                    ci.id,
                    ci.media_url,
                    ci.thumbnail_url,
                    ci.media_type,
                    ci.created_at
                FROM public.capsule_items ci
                WHERE ci.capsule_id = c.id
                  AND ci.media_type IN ('image', 'video')
                  AND ci.is_story = FALSE
                  AND ci.moderation_status <> 'rejected'
                ORDER BY ci.created_at DESC
                LIMIT 4
            ) ci
        ) media ON TRUE
    ) c;

    IF v_viewer_id IS NOT NULL THEN
        SELECT COALESCE(ARRAY_AGG(sr.story_id), ARRAY[]::UUID[])
        INTO v_my_reads
        FROM public.story_reads sr
        WHERE sr.user_id = v_viewer_id;

        SELECT COALESCE(ARRAY_AGG(ci.capsule_id), ARRAY[]::UUID[])
        INTO v_my_accepted_invites
        FROM public.capsule_invites ci
        WHERE ci.user_id = v_viewer_id
          AND ci.status = 'accepted';
    ELSE
        v_my_reads := ARRAY[]::UUID[];
        v_my_accepted_invites := ARRAY[]::UUID[];
    END IF;

    SELECT COALESCE(jsonb_agg(st), '[]'::JSONB)
    INTO v_stickers
    FROM (
        SELECT
            ps.*,
            row_to_json(s) AS stickers
        FROM public.profile_stickers ps
        JOIN public.stickers s ON s.id = ps.sticker_id
        WHERE ps.user_id = p_target_id
    ) st;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'is_following', v_is_following,
        'stories', COALESCE(v_stories, '[]'::JSONB),
        'capsules', COALESCE(v_capsules, '[]'::JSONB),
        'my_reads', COALESCE(v_my_reads, ARRAY[]::UUID[]),
        'my_accepted_invites', COALESCE(v_my_accepted_invites, ARRAY[]::UUID[]),
        'stickers', COALESCE(v_stickers, '[]'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_capsule_detail_unified(
    p_capsule_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_capsule JSONB;
    v_items JSONB;
    v_likes_count BIGINT := 0;
    v_is_liked BOOLEAN := FALSE;
    v_invites JSONB;
    v_comments JSONB;
    v_owner_followers_count BIGINT := 0;
    v_is_followed_owner BOOLEAN := FALSE;
    v_capsule_followers_count BIGINT := 0;
    v_is_followed_capsule BOOLEAN := FALSE;
BEGIN
    SELECT row_to_json(c)::JSONB
    INTO v_capsule
    FROM (
        SELECT
            c.*,
            row_to_json(p)::JSONB AS profiles
        FROM public.capsules c
        JOIN public.profiles p
          ON p.id = c.owner_id
        WHERE c.id = p_capsule_id
    ) c;

    IF v_capsule IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(i ORDER BY i.created_at ASC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT
            ci.id,
            ci.capsule_id,
            ci.owner_id,
            ci.media_url,
            ci.media_type,
            ci.thumbnail_url,
            ci.content,
            ci.caption,
            ci.created_at,
            ci.is_story,
            ci.expires_at,
            ci.moderation_status,
            jsonb_build_object(
                'id', p.id,
                'username', p.username,
                'display_name', p.display_name,
                'avatar_url', p.avatar_url,
                'favorite_color', p.favorite_color
            ) AS profiles
        FROM public.capsule_items ci
        JOIN public.profiles p
          ON p.id = ci.owner_id
        WHERE ci.capsule_id = p_capsule_id
          AND ci.moderation_status <> 'rejected'
        ORDER BY ci.created_at ASC
        LIMIT 500
    ) i;

    SELECT COUNT(*) INTO v_likes_count
    FROM public.likes
    WHERE capsule_id = p_capsule_id;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.likes
            WHERE capsule_id = p_capsule_id
              AND user_id = v_user_id
        )
        INTO v_is_liked;
    END IF;

    SELECT COALESCE(jsonb_agg(inv), '[]'::JSONB)
    INTO v_invites
    FROM (
        SELECT
            ci.id,
            ci.capsule_id,
            ci.user_id,
            ci.status,
            ci.cover_url,
            jsonb_build_object(
                'id', p.id,
                'username', p.username,
                'display_name', p.display_name,
                'avatar_url', p.avatar_url,
                'favorite_color', p.favorite_color
            ) AS profiles
        FROM public.capsule_invites ci
        JOIN public.profiles p
          ON p.id = ci.user_id
        WHERE ci.capsule_id = p_capsule_id
    ) inv;

    SELECT COALESCE(jsonb_agg(cms ORDER BY cms.created_at DESC), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT
            c.id,
            c.capsule_id,
            c.user_id,
            c.content,
            c.created_at,
            jsonb_build_object(
                'id', p.id,
                'username', p.username,
                'display_name', p.display_name,
                'avatar_url', p.avatar_url,
                'is_verified', p.is_verified,
                'favorite_color', p.favorite_color
            ) AS profiles,
            (SELECT COUNT(*) FROM public.comment_likes cl WHERE cl.comment_id = c.id) AS like_count,
            CASE
                WHEN v_user_id IS NULL THEN FALSE
                ELSE EXISTS(SELECT 1 FROM public.comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = v_user_id)
            END AS my_like
        FROM public.comments c
        JOIN public.profiles p
          ON p.id = c.user_id
        WHERE c.capsule_id = p_capsule_id
        ORDER BY c.created_at DESC
        LIMIT 15
    ) cms;

    SELECT COUNT(*) INTO v_owner_followers_count
    FROM public.follows
    WHERE following_id = (v_capsule->>'owner_id')::UUID;

    SELECT COUNT(*) INTO v_capsule_followers_count
    FROM public.capsule_followers
    WHERE capsule_id = p_capsule_id;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.follows
            WHERE follower_id = v_user_id
              AND following_id = (v_capsule->>'owner_id')::UUID
        )
        INTO v_is_followed_owner;

        SELECT EXISTS(
            SELECT 1
            FROM public.capsule_followers
            WHERE user_id = v_user_id
              AND capsule_id = p_capsule_id
        )
        INTO v_is_followed_capsule;
    END IF;

    RETURN jsonb_build_object(
        'capsule', v_capsule,
        'items', COALESCE(v_items, '[]'::JSONB),
        'likes_count', v_likes_count,
        'is_liked', v_is_liked,
        'invites', COALESCE(v_invites, '[]'::JSONB),
        'latest_comments', COALESCE(v_comments, '[]'::JSONB),
        'owner_followers_count', v_owner_followers_count,
        'is_followed_owner', v_is_followed_owner,
        'capsule_followers_count', v_capsule_followers_count,
        'is_followed_capsule', v_is_followed_capsule
    );
END;
$$;
