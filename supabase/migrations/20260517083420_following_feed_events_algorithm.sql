-- Following feed v2: event-based ranking, cursor pagination, session memory,
-- stronger seen penalties, and durable upload batch grouping.

ALTER TABLE public.capsule_items
    ADD COLUMN IF NOT EXISTS batch_id UUID;

ALTER TABLE public.feed_impressions
    ALTER COLUMN capsule_id DROP NOT NULL;

ALTER TABLE public.feed_impressions
    ADD COLUMN IF NOT EXISTS feed_item_key TEXT,
    ADD COLUMN IF NOT EXISTS item_id UUID,
    ADD COLUMN IF NOT EXISTS event_type TEXT,
    ADD COLUMN IF NOT EXISTS feed_type TEXT,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS position INTEGER,
    ADD COLUMN IF NOT EXISTS shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS clicked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS liked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS commented BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS watched_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE public.feed_impressions
SET
    feed_item_key = COALESCE(feed_item_key, feed_event_id),
    shown_at = COALESCE(shown_at, seen_at),
    event_type = COALESCE(event_type, 'legacy'),
    feed_type = COALESCE(feed_type, 'following')
WHERE feed_item_key IS NULL
   OR shown_at IS NULL
   OR event_type IS NULL
   OR feed_type IS NULL;

ALTER TABLE public.feed_impressions
    ALTER COLUMN feed_item_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capsules_feed_owner_created
    ON public.capsules(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capsules_feed_status_opens
    ON public.capsules(status, opens_at DESC)
    WHERE opens_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capsules_feed_public_created
    ON public.capsules(created_at DESC)
    WHERE is_public = TRUE;

CREATE INDEX IF NOT EXISTS idx_capsule_items_feed_recent
    ON public.capsule_items(capsule_id, created_at DESC)
    WHERE is_story = FALSE AND moderation_status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_capsule_items_feed_batch
    ON public.capsule_items(capsule_id, owner_id, batch_id, created_at DESC)
    WHERE is_story = FALSE AND moderation_status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_capsule_followers_user_capsule
    ON public.capsule_followers(user_id, capsule_id);

CREATE INDEX IF NOT EXISTS idx_capsule_followers_capsule_user
    ON public.capsule_followers(capsule_id, user_id);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_key
    ON public.feed_impressions(user_id, feed_item_key);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_session
    ON public.feed_impressions(user_id, session_id, shown_at DESC)
    WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_capsule_shown
    ON public.feed_impressions(user_id, capsule_id, shown_at DESC)
    WHERE capsule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_capsule_created
    ON public.comments(capsule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_capsule_user
    ON public.likes(capsule_id, user_id);

DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, UUID[], TEXT[]);
DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, TEXT[], UUID[]);

CREATE OR REPLACE FUNCTION public.record_feed_impressions(
    p_user_id UUID,
    p_feed_event_ids TEXT[],
    p_capsule_ids UUID[] DEFAULT NULL,
    p_event_types TEXT[] DEFAULT NULL,
    p_feed_type TEXT DEFAULT 'following',
    p_session_id TEXT DEFAULT NULL,
    p_positions INTEGER[] DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.feed_impressions(
        user_id,
        capsule_id,
        feed_event_id,
        feed_item_key,
        event_type,
        feed_type,
        session_id,
        position,
        seen_at,
        shown_at,
        created_at
    )
    SELECT
        p_user_id,
        CASE WHEN p_capsule_ids IS NULL THEN NULL ELSE p_capsule_ids[e.ordinality] END,
        e.feed_event_id,
        e.feed_event_id,
        COALESCE(CASE WHEN p_event_types IS NULL THEN NULL ELSE p_event_types[e.ordinality] END, 'unknown'),
        COALESCE(p_feed_type, 'following'),
        p_session_id,
        CASE WHEN p_positions IS NULL THEN NULL ELSE p_positions[e.ordinality] END,
        now(),
        now(),
        now()
    FROM unnest(p_feed_event_ids) WITH ORDINALITY AS e(feed_event_id, ordinality)
    WHERE p_user_id IS NOT NULL
      AND e.feed_event_id IS NOT NULL
    ON CONFLICT (user_id, feed_event_id)
    DO UPDATE SET
        capsule_id = COALESCE(EXCLUDED.capsule_id, public.feed_impressions.capsule_id),
        feed_item_key = EXCLUDED.feed_item_key,
        event_type = EXCLUDED.event_type,
        feed_type = EXCLUDED.feed_type,
        session_id = EXCLUDED.session_id,
        position = EXCLUDED.position,
        seen_at = EXCLUDED.seen_at,
        shown_at = EXCLUDED.shown_at,
        created_at = EXCLUDED.created_at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.record_feed_click(
    p_user_id UUID,
    p_capsule_id UUID,
    p_feed_event_id TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.feed_impressions(
        user_id,
        capsule_id,
        feed_event_id,
        feed_item_key,
        event_type,
        feed_type,
        seen_at,
        shown_at,
        created_at,
        clicked_at,
        clicked,
        opened,
        click_count
    )
    VALUES (
        p_user_id,
        p_capsule_id,
        COALESCE(p_feed_event_id, p_capsule_id::text),
        COALESCE(p_feed_event_id, p_capsule_id::text),
        'open',
        'following',
        now(),
        now(),
        now(),
        now(),
        TRUE,
        TRUE,
        1
    )
    ON CONFLICT (user_id, feed_event_id)
    DO UPDATE SET
        capsule_id = COALESCE(EXCLUDED.capsule_id, public.feed_impressions.capsule_id),
        feed_item_key = EXCLUDED.feed_item_key,
        clicked_at = now(),
        clicked = TRUE,
        opened = TRUE,
        seen_at = now(),
        shown_at = now(),
        created_at = now(),
        click_count = public.feed_impressions.click_count + 1;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_combined_feed_data(TEXT, TEXT, INTEGER, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS public.get_combined_feed_data(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_combined_feed_data(UUID, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_combined_feed_data(
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
RETURNS JSONB AS $$
DECLARE
    v_my_id UUID := auth.uid();
    v_following_ids UUID[];
    v_blocked_ids UUID[];
    v_feed JSONB;
    v_stories JSONB;
BEGIN
    SELECT COALESCE(array_agg(following_id), ARRAY[]::UUID[])
    INTO v_following_ids
    FROM public.follows
    WHERE follower_id = v_my_id;

    SELECT COALESCE(array_agg(blocked_user_id), ARRAY[]::UUID[])
    INTO v_blocked_ids
    FROM (
        SELECT blocked_id AS blocked_user_id
        FROM public.blocks
        WHERE blocker_id = v_my_id
        UNION
        SELECT blocker_id AS blocked_user_id
        FROM public.blocks
        WHERE blocked_id = v_my_id
    ) b;

    SELECT jsonb_agg(f ORDER BY (f->>'final_score')::DOUBLE PRECISION DESC, (f->>'activity_date')::TIMESTAMPTZ DESC, f->>'id')
    INTO v_feed
    FROM (
        WITH
        my_capsule_follows AS (
            SELECT capsule_id
            FROM public.capsule_followers
            WHERE user_id = v_my_id
        ),
        my_participation AS (
            SELECT capsule_id
            FROM public.capsule_invites
            WHERE user_id = v_my_id
              AND status = 'accepted'
        ),
        mutual_follows AS (
            SELECT f.following_id AS owner_id
            FROM public.follows f
            JOIN public.follows back
              ON back.follower_id = f.following_id
             AND back.following_id = v_my_id
            WHERE f.follower_id = v_my_id
        ),
        relationship_scores AS (
            SELECT owner_id, SUM(points) AS score
            FROM (
                SELECT c.owner_id, 15::DOUBLE PRECISION AS points
                FROM public.likes l
                JOIN public.capsules c ON c.id = l.capsule_id
                WHERE l.user_id = v_my_id

                UNION ALL

                SELECT c.owner_id, 35::DOUBLE PRECISION AS points
                FROM public.comments cm
                JOIN public.capsules c ON c.id = cm.capsule_id
                WHERE cm.user_id = v_my_id
                  AND cm.created_at > now() - interval '90 days'

                UNION ALL

                SELECT c.owner_id, 40::DOUBLE PRECISION AS points
                FROM public.feed_impressions fi
                JOIN public.capsules c ON c.id = fi.capsule_id
                WHERE fi.user_id = v_my_id
                  AND fi.opened = TRUE
                  AND fi.shown_at > now() - interval '90 days'
            ) rel
            WHERE owner_id IS NOT NULL
              AND owner_id <> v_my_id
            GROUP BY owner_id
        ),
        ignored_author_scores AS (
            SELECT c.owner_id,
                   COUNT(*) FILTER (WHERE fi.clicked = FALSE AND fi.opened = FALSE) AS passive_views,
                   COUNT(*) FILTER (WHERE fi.clicked = TRUE OR fi.opened = TRUE) AS active_views
            FROM public.feed_impressions fi
            JOIN public.capsules c ON c.id = fi.capsule_id
            WHERE fi.user_id = v_my_id
              AND fi.shown_at > now() - interval '30 days'
            GROUP BY c.owner_id
        ),
        candidate_capsules AS (
            SELECT
                c.*,
                regexp_replace(COALESCE(c.description, ''), '\[STYLE:[A-Z]+\]', '', 'g') AS clean_description,
                (c.owner_id = v_my_id) AS is_mine,
                (c.owner_id = ANY(v_following_ids)) AS is_followed_author,
                EXISTS (SELECT 1 FROM mutual_follows mf WHERE mf.owner_id = c.owner_id) AS is_mutual,
                EXISTS (SELECT 1 FROM my_capsule_follows mcf WHERE mcf.capsule_id = c.id) AS is_followed_capsule,
                EXISTS (SELECT 1 FROM my_participation mp WHERE mp.capsule_id = c.id) AS is_participant,
                COALESCE(rel.score, 0) AS relationship_interaction_score,
                COALESCE(ias.passive_views, 0) AS passive_author_views,
                COALESCE(ias.active_views, 0) AS active_author_views,
                COALESCE(latest_item.latest_item_at, c.updated_at, c.created_at) AS latest_content_at,
                COALESCE(latest_comment.latest_comment_at, c.updated_at, c.created_at) AS latest_comment_at
            FROM public.capsules c
            LEFT JOIN relationship_scores rel ON rel.owner_id = c.owner_id
            LEFT JOIN ignored_author_scores ias ON ias.owner_id = c.owner_id
            LEFT JOIN LATERAL (
                SELECT MAX(ci.created_at) AS latest_item_at
                FROM public.capsule_items ci
                WHERE ci.capsule_id = c.id
                  AND ci.is_story = FALSE
                  AND ci.moderation_status <> 'rejected'
            ) latest_item ON TRUE
            LEFT JOIN LATERAL (
                SELECT MAX(cm.created_at) AS latest_comment_at
                FROM public.comments cm
                WHERE cm.capsule_id = c.id
            ) latest_comment ON TRUE
            WHERE c.owner_id IS NOT NULL
              AND NOT (c.owner_id = ANY(v_blocked_ids))
              AND (
                    CASE
                        WHEN p_filter = 'open' THEN c.status = 'opened'
                        WHEN p_filter = 'closed' THEN c.status = 'sealed'
                        ELSE TRUE
                    END
              )
              AND (
                    c.is_public = TRUE
                    OR c.owner_id = v_my_id
                    OR EXISTS (SELECT 1 FROM my_participation mp WHERE mp.capsule_id = c.id)
                    OR EXISTS (SELECT 1 FROM my_capsule_follows mcf WHERE mcf.capsule_id = c.id)
              )
              AND (
                    (p_tab = 'following' AND (
                        c.owner_id = v_my_id
                        OR c.owner_id = ANY(v_following_ids)
                        OR EXISTS (SELECT 1 FROM my_capsule_follows mcf WHERE mcf.capsule_id = c.id)
                    ))
                    OR
                    (p_tab = 'explore' AND c.is_public = TRUE AND c.owner_id <> v_my_id AND NOT (c.owner_id = ANY(v_following_ids)))
              )
              AND (
                    c.created_at > now() - interval '30 days'
                    OR c.updated_at > now() - interval '30 days'
                    OR c.opens_at BETWEEN now() - interval '14 days' AND now() + interval '14 days'
                    OR EXISTS (
                        SELECT 1
                        FROM public.capsule_items ci_recent
                        WHERE ci_recent.capsule_id = c.id
                          AND ci_recent.is_story = FALSE
                          AND ci_recent.moderation_status <> 'rejected'
                          AND ci_recent.created_at > now() - interval '30 days'
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM public.comments cm_recent
                        WHERE cm_recent.capsule_id = c.id
                          AND cm_recent.created_at > now() - interval '14 days'
                    )
                    OR EXISTS (SELECT 1 FROM my_capsule_follows mcf WHERE mcf.capsule_id = c.id)
                    OR NOT EXISTS (
                        SELECT 1
                        FROM public.feed_impressions fi_old
                        WHERE fi_old.user_id = v_my_id
                          AND fi_old.capsule_id = c.id
                          AND fi_old.shown_at > now() - interval '180 days'
                    )
              )
        ),
        item_batches AS (
            SELECT
                ci.capsule_id,
                ci.owner_id AS actor_id,
                COALESCE(
                    ci.batch_id::TEXT,
                    substring(ci.caption FROM '!!b:([a-z0-9-]+)'),
                    to_char(date_trunc('hour', ci.created_at), 'YYYYMMDDHH24')
                ) AS batch_group,
                MIN(ci.id::TEXT)::UUID AS representative_item_id,
                MAX(ci.created_at) AS activity_date,
                COUNT(*) AS item_count
            FROM public.capsule_items ci
            JOIN candidate_capsules cc ON cc.id = ci.capsule_id
            WHERE ci.is_story = FALSE
              AND ci.media_type IN ('image', 'video')
              AND ci.moderation_status <> 'rejected'
              AND ci.created_at > now() - interval '30 days'
            GROUP BY ci.capsule_id, ci.owner_id, COALESCE(ci.batch_id::TEXT, substring(ci.caption FROM '!!b:([a-z0-9-]+)'), to_char(date_trunc('hour', ci.created_at), 'YYYYMMDDHH24'))
        ),
        primary_events AS (
            SELECT
                'capsule_created:' || cc.id::TEXT AS feed_item_key,
                cc.id AS capsule_id,
                NULL::UUID AS item_id,
                cc.owner_id AS actor_id,
                'capsule_created'::TEXT AS event_type,
                'capsule'::TEXT AS feed_type,
                cc.created_at AS activity_date,
                70::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM candidate_capsules cc
            WHERE cc.created_at > now() - interval '30 days'

            UNION ALL

            SELECT
                'capsule_opened:' || cc.id::TEXT || ':' || to_char(COALESCE(cc.opens_at, cc.updated_at, cc.created_at), 'YYYY-MM-DD') AS feed_item_key,
                cc.id AS capsule_id,
                NULL::UUID AS item_id,
                cc.owner_id AS actor_id,
                'capsule_opened'::TEXT AS event_type,
                CASE WHEN cc.cover_url IS NOT NULL OR cc.latest_content_at > cc.created_at THEN 'item' ELSE 'capsule' END AS feed_type,
                COALESCE(cc.opens_at, cc.updated_at, cc.created_at) AS activity_date,
                180::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM candidate_capsules cc
            WHERE cc.status = 'opened'
              AND COALESCE(cc.opens_at, cc.updated_at, cc.created_at) > now() - interval '30 days'

            UNION ALL

            SELECT
                'opening_soon:' || cc.id::TEXT || ':' || to_char(cc.opens_at, 'YYYY-MM-DD') AS feed_item_key,
                cc.id AS capsule_id,
                NULL::UUID AS item_id,
                cc.owner_id AS actor_id,
                'opening_soon'::TEXT AS event_type,
                'capsule'::TEXT AS feed_type,
                cc.opens_at AS activity_date,
                65::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM candidate_capsules cc
            WHERE cc.status = 'sealed'
              AND cc.opens_at > now()
              AND cc.opens_at <= now() + interval '7 days'

            UNION ALL

            SELECT
                'item_batch:' || ib.capsule_id::TEXT || ':' || ib.batch_group AS feed_item_key,
                ib.capsule_id,
                ib.representative_item_id AS item_id,
                ib.actor_id,
                'item_batch_added'::TEXT AS event_type,
                'item'::TEXT AS feed_type,
                ib.activity_date,
                100::DOUBLE PRECISION AS event_type_score,
                ib.batch_group
            FROM item_batches ib

            UNION ALL

            SELECT
                'capsule_commented:' || cc.id::TEXT || ':' || to_char(date_trunc('day', cc.latest_comment_at), 'YYYY-MM-DD') AS feed_item_key,
                cc.id AS capsule_id,
                NULL::UUID AS item_id,
                cc.owner_id AS actor_id,
                'capsule_commented'::TEXT AS event_type,
                'capsule'::TEXT AS feed_type,
                cc.latest_comment_at AS activity_date,
                40::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM candidate_capsules cc
            WHERE cc.latest_comment_at > now() - interval '7 days'
              AND cc.latest_comment_at > cc.created_at + interval '5 minutes'

            UNION ALL

            SELECT
                'old_unseen_capsule:' || cc.id::TEXT AS feed_item_key,
                cc.id AS capsule_id,
                NULL::UUID AS item_id,
                cc.owner_id AS actor_id,
                'old_unseen_capsule'::TEXT AS event_type,
                CASE WHEN cc.status = 'opened' THEN 'item' ELSE 'capsule' END AS feed_type,
                cc.latest_content_at AS activity_date,
                35::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM candidate_capsules cc
            WHERE cc.created_at <= now() - interval '30 days'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.feed_impressions fi
                  WHERE fi.user_id = v_my_id
                    AND fi.capsule_id = cc.id
                    AND fi.shown_at > now() - interval '180 days'
              )

            UNION ALL

            SELECT
                'birthday:' || p.id::TEXT || ':' || to_char(now(), 'YYYY-MM-DD') AS feed_item_key,
                NULL::UUID AS capsule_id,
                NULL::UUID AS item_id,
                p.id AS actor_id,
                'birthday'::TEXT AS event_type,
                'birthday'::TEXT AS feed_type,
                now() AS activity_date,
                140::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM public.profiles p
            WHERE p.id = ANY(v_following_ids)
              AND p.id <> v_my_id
              AND NOT (p.id = ANY(v_blocked_ids))
              AND p.birthdate IS NOT NULL
              AND EXTRACT(MONTH FROM p.birthdate) = EXTRACT(MONTH FROM now())
              AND EXTRACT(DAY FROM p.birthdate) = EXTRACT(DAY FROM now())
              AND p_tab = 'following'
              AND p_filter = 'all'
        ),
        recommendation_events AS (
            SELECT
                'recommendation:' || c.id::TEXT AS feed_item_key,
                c.id AS capsule_id,
                NULL::UUID AS item_id,
                c.owner_id AS actor_id,
                'recommendation'::TEXT AS event_type,
                CASE WHEN c.status = 'opened' THEN 'item' ELSE 'capsule' END AS feed_type,
                GREATEST(c.created_at, COALESCE(c.updated_at, c.created_at), COALESCE(c.opens_at, c.created_at)) AS activity_date,
                20::DOUBLE PRECISION AS event_type_score,
                NULL::TEXT AS batch_group
            FROM public.capsules c
            WHERE p_tab = 'following'
              AND (SELECT COUNT(*) FROM primary_events pe WHERE pe.event_type <> 'recommendation') < GREATEST(8, p_limit)
              AND c.is_public = TRUE
              AND c.owner_id <> v_my_id
              AND NOT (c.owner_id = ANY(v_following_ids))
              AND NOT (c.owner_id = ANY(v_blocked_ids))
              AND (
                    c.created_at > now() - interval '30 days'
                    OR c.opens_at BETWEEN now() AND now() + interval '7 days'
                    OR c.status = 'opened'
              )
              AND (
                    CASE
                        WHEN p_filter = 'open' THEN c.status = 'opened'
                        WHEN p_filter = 'closed' THEN c.status = 'sealed'
                        ELSE TRUE
                    END
              )
            ORDER BY GREATEST(c.created_at, COALESCE(c.updated_at, c.created_at), COALESCE(c.opens_at, c.created_at)) DESC
            LIMIT 30
        ),
        events AS (
            SELECT * FROM primary_events
            UNION ALL
            SELECT * FROM recommendation_events
        ),
        deduped_events AS (
            SELECT *
            FROM (
                SELECT
                    e.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY e.feed_item_key
                        ORDER BY e.event_type_score DESC, e.activity_date DESC
                    ) AS key_rank
                FROM events e
            ) x
            WHERE key_rank = 1
        ),
        scored AS (
            SELECT
                e.*,
                cc.title,
                cc.clean_description,
                cc.status,
                cc.opens_at,
                cc.type,
                cc.model,
                cc.chain_id,
                cc.is_public,
                cc.cover_url,
                cc.created_at,
                cc.model_snapshot,
                cc.owner_id AS capsule_owner_id,
                cc.is_mine,
                cc.is_followed_author,
                cc.is_mutual,
                cc.is_followed_capsule,
                cc.is_participant,
                cc.relationship_interaction_score,
                cc.passive_author_views,
                cc.active_author_views,
                cc.latest_content_at,
                cc.latest_comment_at,
                exact_seen.seen_at AS event_seen_at,
                exact_seen.session_seen_at,
                capsule_seen.last_capsule_seen_at,
                COALESCE(author_session.views_in_session, 0) AS author_views_in_session,
                COALESCE(lks.count, 0) AS likes_count,
                COALESCE(cms.count, 0) AS comments_count,
                COALESCE(pts.count, 0) AS posts_count,
                COALESCE(fols.count, 0) AS capsule_followers_count,
                CASE
                    WHEN e.activity_date > now() - interval '1 hour' THEN 100
                    WHEN e.activity_date > now() - interval '6 hours' THEN 80
                    WHEN e.activity_date > now() - interval '24 hours' THEN 60
                    WHEN e.activity_date > now() - interval '3 days' THEN 35
                    WHEN e.activity_date > now() - interval '7 days' THEN 15
                    ELSE 0
                END AS recency_score,
                CASE
                    WHEN e.event_type = 'capsule_opened' AND cc.opens_at > now() - interval '24 hours' THEN 180
                    WHEN e.event_type = 'opening_soon' AND cc.opens_at <= now() + interval '24 hours' THEN 80
                    WHEN e.event_type = 'opening_soon' THEN 45
                    ELSE 0
                END AS opening_score,
                LEAST(
                    80,
                    COALESCE(lks.count, 0) * 1
                    + COALESCE(cms.count, 0) * 5
                    + COALESCE(fols.count, 0) * 10
                    + COALESCE(pts.count, 0) * 4
                ) AS engagement_score,
                0::DOUBLE PRECISION AS birthday_score,
                CASE
                    WHEN cc.is_followed_capsule THEN 90
                    ELSE 0
                END AS capsule_follow_score,
                CASE
                    WHEN cc.is_mine THEN 25
                    WHEN cc.is_followed_author AND cc.is_mutual THEN 100
                    WHEN cc.is_followed_author THEN 50
                    WHEN cc.is_mutual THEN 45
                    ELSE 0
                END + LEAST(COALESCE(cc.relationship_interaction_score, 0), 120) AS relationship_score,
                CASE
                    WHEN e.event_type = 'item_batch_added' AND cc.latest_content_at > COALESCE(capsule_seen.last_capsule_seen_at, 'epoch'::TIMESTAMPTZ) THEN 120
                    WHEN e.event_type = 'capsule_opened' AND cc.opens_at > COALESCE(capsule_seen.last_capsule_seen_at, 'epoch'::TIMESTAMPTZ) THEN 180
                    WHEN e.event_type = 'capsule_commented' AND cc.latest_comment_at > COALESCE(capsule_seen.last_capsule_seen_at, 'epoch'::TIMESTAMPTZ) THEN 30
                    ELSE 0
                END AS new_activity_bonus,
                CASE
                    WHEN exact_seen.session_seen_at IS NOT NULL THEN 300
                    WHEN exact_seen.seen_at IS NULL THEN 0
                    WHEN exact_seen.seen_at > now() - interval '10 minutes' THEN 300
                    WHEN exact_seen.seen_at > now() - interval '1 hour' THEN 250
                    WHEN exact_seen.seen_at > now() - interval '1 day' THEN 150
                    WHEN exact_seen.seen_at > now() - interval '2 days' THEN 80
                    WHEN exact_seen.seen_at > now() - interval '7 days' THEN 40
                    ELSE 10
                END AS seen_penalty,
                CASE
                    WHEN COALESCE(author_session.views_in_session, 0) >= 3 THEN 80
                    WHEN COALESCE(author_session.views_in_session, 0) = 2 THEN 45
                    WHEN COALESCE(author_session.views_in_session, 0) = 1 THEN 18
                    ELSE 0
                END AS repeated_author_penalty,
                CASE
                    WHEN cc.passive_author_views >= 6 AND cc.active_author_views = 0 THEN 30
                    ELSE 0
                END AS ignored_author_penalty,
                CASE
                    WHEN e.event_type IN ('birthday', 'capsule_opened', 'opening_soon', 'old_unseen_capsule') THEN 0
                    WHEN e.activity_date < now() - interval '30 days' THEN 35
                    WHEN e.activity_date < now() - interval '7 days' THEN 12
                    ELSE 0
                END AS stale_penalty,
                ((abs(hashtext(COALESCE(p_session_id, '') || ':' || e.feed_item_key || ':' || p_seed::TEXT)) % 2000)::DOUBLE PRECISION / 100.0) AS random_light_boost
            FROM deduped_events e
            LEFT JOIN candidate_capsules cc ON cc.id = e.capsule_id
            LEFT JOIN LATERAL (
                SELECT
                    MAX(fi.shown_at) AS seen_at,
                    MAX(fi.shown_at) FILTER (WHERE p_session_id IS NOT NULL AND fi.session_id = p_session_id) AS session_seen_at
                FROM public.feed_impressions fi
                WHERE fi.user_id = v_my_id
                  AND fi.feed_event_id = e.feed_item_key
            ) exact_seen ON TRUE
            LEFT JOIN LATERAL (
                SELECT MAX(fi.shown_at) AS last_capsule_seen_at
                FROM public.feed_impressions fi
                WHERE fi.user_id = v_my_id
                  AND fi.capsule_id = e.capsule_id
            ) capsule_seen ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS views_in_session
                FROM public.feed_impressions fi
                JOIN public.capsules fc ON fc.id = fi.capsule_id
                WHERE fi.user_id = v_my_id
                  AND p_session_id IS NOT NULL
                  AND fi.session_id = p_session_id
                  AND fc.owner_id = e.actor_id
            ) author_session ON TRUE
            LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM public.likes WHERE capsule_id = e.capsule_id) lks ON TRUE
            LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM public.comments WHERE capsule_id = e.capsule_id) cms ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS count
                FROM public.capsule_items
                WHERE capsule_id = e.capsule_id
                  AND media_type IN ('image', 'video')
                  AND is_story = FALSE
                  AND moderation_status <> 'rejected'
            ) pts ON TRUE
            LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM public.capsule_followers WHERE capsule_id = e.capsule_id) fols ON TRUE
        ),
        final_scored AS (
            SELECT
                s.*,
                (
                    s.event_type_score
                    + s.relationship_score
                    + s.capsule_follow_score
                    + s.recency_score
                    + s.opening_score
                    + s.engagement_score
                    + s.birthday_score
                    + s.new_activity_bonus
                    + s.random_light_boost
                    - s.seen_penalty
                    - s.repeated_author_penalty
                    - s.ignored_author_penalty
                    - s.stale_penalty
                )::DOUBLE PRECISION AS final_score
            FROM scored s
        ),
        cursor_filtered AS (
            SELECT *
            FROM final_scored fs
            WHERE (
                p_refresh_mode <> 'infinite_scroll'
                OR p_cursor_score IS NULL
                OR fs.final_score < p_cursor_score
                OR (fs.final_score = p_cursor_score AND fs.activity_date < p_cursor_activity_date)
                OR (fs.final_score = p_cursor_score AND fs.activity_date = p_cursor_activity_date AND fs.feed_item_key > COALESCE(p_cursor_id, ''))
            )
        ),
        diversity AS (
            SELECT
                cf.*,
                ROW_NUMBER() OVER (PARTITION BY cf.actor_id ORDER BY cf.final_score DESC, cf.activity_date DESC) AS author_rank,
                ROW_NUMBER() OVER (PARTITION BY cf.event_type ORDER BY cf.final_score DESC, cf.activity_date DESC) AS event_rank,
                ROW_NUMBER() OVER (PARTITION BY cf.status ORDER BY cf.final_score DESC, cf.activity_date DESC) AS status_rank
            FROM cursor_filtered cf
        ),
        selected AS (
            SELECT *
            FROM diversity d
            WHERE (d.actor_id IS NULL OR d.author_rank <= CASE WHEN p_refresh_mode = 'infinite_scroll' THEN 5 ELSE 3 END OR d.is_followed_capsule)
              AND (d.event_type <> 'birthday' OR d.event_rank <= 2)
              AND (
                    d.status IS DISTINCT FROM 'sealed'
                    OR d.is_followed_capsule
                    OR d.status_rank <= GREATEST(2, CEIL(p_limit * 0.35)::INTEGER)
              )
            ORDER BY d.final_score DESC, d.activity_date DESC, d.feed_item_key ASC
            LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 15), 30))
        )
        SELECT jsonb_build_object(
            'id', s.feed_item_key,
            'feed_item_key', s.feed_item_key,
            'feed_event_id', s.feed_item_key,
            'feed_type', s.feed_type,
            'event_type', s.event_type,
            'activity_date', s.activity_date,
            'final_score', s.final_score,
            'title', COALESCE(s.title, CASE WHEN s.event_type = 'birthday' THEN 'Birthday' ELSE '' END),
            'description', COALESCE(s.clean_description, ''),
            'status', COALESCE(s.status, 'opened'),
            'opens_at', s.opens_at,
            'type', COALESCE(s.type, s.event_type),
            'model', s.model,
            'model_snapshot', s.model_snapshot,
            'chain_id', s.chain_id,
            'is_public', COALESCE(s.is_public, TRUE),
            'cover_url', s.cover_url,
            'created_at', COALESCE(s.created_at, s.activity_date),
            'capsule_id', s.capsule_id,
            'owner_id', s.actor_id,
            'capsule_owner_id', s.capsule_owner_id,
            'profiles', prof.profile_data,
            'likes_count', COALESCE(s.likes_count, 0),
            'comments_count', COALESCE(s.comments_count, 0),
            'posts_count', COALESCE(s.posts_count, 0),
            'capsule_followers_count', COALESCE(s.capsule_followers_count, 0),
            'latest_item', COALESCE(li.item_data, jsonb_build_object('media_url', s.cover_url)),
            'collage_items', COALESCE(col.collage_data, '[]'::jsonb),
            'has_seen', s.event_seen_at IS NOT NULL,
            'is_followed_capsule', COALESCE(s.is_followed_capsule, FALSE),
            'cursor_score', s.final_score,
            'cursor_activity_date', s.activity_date,
            'cursor_id', s.feed_item_key
        ) AS f
        FROM selected s
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object(
                'id', p.id,
                'username', p.username,
                'display_name', p.display_name,
                'avatar_url', p.avatar_url,
                'is_verified', p.is_verified,
                'favorite_color', p.favorite_color,
                'birthdate', p.birthdate
            ) AS profile_data
            FROM public.profiles p
            WHERE p.id = s.actor_id
        ) prof ON TRUE
        LEFT JOIN LATERAL (
            SELECT row_to_json(ci2)::jsonb AS item_data
            FROM (
                SELECT id, media_url, media_type, thumbnail_url, content, caption, created_at
                FROM public.capsule_items ci
                WHERE ci.capsule_id = s.capsule_id
                  AND ci.media_type IN ('image', 'video')
                  AND ci.is_story = FALSE
                  AND ci.moderation_status <> 'rejected'
                  AND (
                        s.batch_group IS NULL
                        OR COALESCE(ci.batch_id::TEXT, substring(ci.caption FROM '!!b:([a-z0-9-]+)'), to_char(date_trunc('hour', ci.created_at), 'YYYYMMDDHH24')) = s.batch_group
                  )
                ORDER BY ci.created_at DESC
                LIMIT 1
            ) ci2
        ) li ON TRUE
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(sub.t ORDER BY sub.created_at DESC) AS collage_data
            FROM (
                SELECT
                    jsonb_build_object(
                        'id', ci.id,
                        'media_url', ci.media_url,
                        'media_type', ci.media_type,
                        'thumbnail_url', ci.thumbnail_url
                    ) AS t,
                    ci.created_at
                FROM public.capsule_items ci
                WHERE ci.capsule_id = s.capsule_id
                  AND ci.media_type IN ('image', 'video')
                  AND ci.is_story = FALSE
                  AND ci.moderation_status <> 'rejected'
                  AND (
                        s.batch_group IS NULL
                        OR COALESCE(ci.batch_id::TEXT, substring(ci.caption FROM '!!b:([a-z0-9-]+)'), to_char(date_trunc('hour', ci.created_at), 'YYYYMMDDHH24')) = s.batch_group
                  )
                ORDER BY ci.created_at DESC
                LIMIT 4
            ) sub
        ) col ON TRUE
    ) feed_rows;

    SELECT jsonb_agg(s) INTO v_stories FROM (
        SELECT
            i.*,
            row_to_json(p) AS profiles,
            row_to_json(cap) AS capsules,
            EXISTS(
                SELECT 1
                FROM public.story_reads
                WHERE user_id = v_my_id
                  AND story_id = i.id
            ) AS is_read
        FROM public.capsule_items i
        JOIN public.profiles p ON p.id = i.owner_id
        JOIN public.capsules cap ON cap.id = i.capsule_id
        WHERE i.is_story = TRUE
          AND i.expires_at > now()
          AND NOT (i.owner_id = ANY(v_blocked_ids))
        ORDER BY i.created_at DESC
    ) s;

    RETURN jsonb_build_object(
        'feed', COALESCE(v_feed, '[]'::jsonb),
        'stories', COALESCE(v_stories, '[]'::jsonb),
        'following_ids', COALESCE(to_jsonb(v_following_ids), '[]'::jsonb),
        'blocked_ids', COALESCE(to_jsonb(v_blocked_ids), '[]'::jsonb),
        'liked_ids', (SELECT COALESCE(jsonb_agg(capsule_id), '[]'::jsonb) FROM public.likes WHERE user_id = v_my_id),
        'participant_ids', (SELECT COALESCE(jsonb_agg(capsule_id), '[]'::jsonb) FROM public.capsule_invites WHERE user_id = v_my_id AND status = 'accepted')
    );
END;
$$ LANGUAGE plpgsql STABLE;
