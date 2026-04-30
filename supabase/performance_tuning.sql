-- PERFORMANCE TUNING & INDEXING
-- 1. DATABASE INDEXES FOR FASTER LOOKUPS
-- These indexes target the most frequent JOIN and WHERE clauses in the app.

-- Capsules lookups
CREATE INDEX IF NOT EXISTS idx_capsules_owner_id ON public.capsules(owner_id);
CREATE INDEX IF NOT EXISTS idx_capsules_status_created ON public.capsules(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capsules_public_created ON public.capsules(is_public, created_at DESC) WHERE is_public = true;

-- Items (The heaviest table)
CREATE INDEX IF NOT EXISTS idx_capsule_items_capsule_id_created ON public.capsule_items(capsule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capsule_items_owner_story ON public.capsule_items(owner_id, is_story, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_capsule_items_moderation ON public.capsule_items(moderation_status) WHERE moderation_status = 'rejected';

-- Interactions
CREATE INDEX IF NOT EXISTS idx_likes_capsule_user ON public.likes(capsule_id, user_id);
CREATE INDEX IF NOT EXISTS idx_comments_capsule_created ON public.comments(capsule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON public.follows(follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_follower ON public.follows(following_id, follower_id);

-- Invitations & Followers
CREATE INDEX IF NOT EXISTS idx_capsule_invites_user_status ON public.capsule_invites(user_id, status);
CREATE INDEX IF NOT EXISTS idx_capsule_invites_capsule_id ON public.capsule_invites(capsule_id);
CREATE INDEX IF NOT EXISTS idx_capsule_followers_user_capsule ON public.capsule_followers(user_id, capsule_id);

-- Impressions (for Feed Algorithm)
CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_capsule ON public.feed_impressions(user_id, capsule_id);

-- 2. RE-OPTIMIZED get_profile_data_unified
-- Moves all logic to DB to avoid frontend waterfalls
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

    -- Capsules (Optimized with Counts, Per-user covers, and fallback media)
    SELECT jsonb_agg(c) INTO v_capsules FROM (
        WITH all_caps_ids AS (
            SELECT id FROM capsules WHERE owner_id = p_target_id OR invited_user_id = p_target_id
            UNION
            SELECT capsule_id FROM capsule_invites WHERE user_id = p_target_id AND status = 'accepted'
        )
        SELECT 
            c.*,
            COALESCE(inv.cover_url, c.cover_url) as effective_cover_url,
            COALESCE(lks.count, 0) AS likes_count,
            COALESCE(cms.count, 0) AS comments_count,
            COALESCE(pts.count, 0) AS posts_count,
            (SELECT jsonb_agg(li) FROM (
                SELECT media_url, thumbnail_url, media_type FROM capsule_items 
                WHERE capsule_id = c.id AND media_type IN ('image','video') AND NOT is_story 
                ORDER BY created_at DESC LIMIT 1
            ) li) as fallback_media
        FROM capsules c
        JOIN all_caps_ids aci ON aci.id = c.id
        LEFT JOIN capsule_invites inv ON inv.capsule_id = c.id AND inv.user_id = p_target_id
        LEFT JOIN LATERAL (SELECT count(*) as count FROM likes WHERE capsule_id = c.id) lks ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM comments WHERE capsule_id = c.id) cms ON true
        LEFT JOIN LATERAL (SELECT count(*) as count FROM capsule_items WHERE capsule_id = c.id AND media_type IN ('image','video') AND NOT is_story) pts ON true
        ORDER BY c.created_at DESC
    ) c;

    -- Viewer context
    SELECT COALESCE(ARRAY_AGG(story_id), ARRAY[]::UUID[]) INTO v_my_reads FROM story_reads WHERE user_id = v_viewer_id;
    SELECT COALESCE(ARRAY_AGG(capsule_id), ARRAY[]::UUID[]) INTO v_my_accepted_invites FROM capsule_invites WHERE user_id = v_viewer_id AND status = 'accepted';

    -- Stickers
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

-- 3. OPTIMIZED get_capsule_detail_unified
-- Includes basic profile map to reduce row weight
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
    v_comments JSONB;
    v_delete_votes JSONB;
    v_owner_followers_count BIGINT;
    v_is_followed_owner BOOLEAN;
    v_capsule_followers_count BIGINT;
    v_is_followed_capsule BOOLEAN;
BEGIN
    -- Capsule data (pre-fetch owner profile)
    SELECT row_to_json(c)::jsonb INTO v_capsule FROM (
        SELECT c.*, row_to_json(p)::jsonb as profiles
        FROM capsules c
        JOIN profiles p ON p.id = c.owner_id
        WHERE c.id = p_capsule_id
    ) c;

    IF v_capsule IS NULL THEN
        RETURN NULL;
    END IF;

    -- Items (Paginate or limit if needed, here we take all but could limit to 300)
    SELECT jsonb_agg(i) INTO v_items FROM (
        SELECT ci.id, ci.capsule_id, ci.owner_id, ci.media_url, ci.media_type, ci.thumbnail_url, ci.content, ci.created_at, ci.moderation_status,
               jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'favorite_color', p.favorite_color) as profiles
        FROM capsule_items ci
        JOIN profiles p ON p.id = ci.owner_id
        WHERE ci.capsule_id = p_capsule_id
        AND ci.moderation_status != 'rejected'
        ORDER BY ci.created_at ASC
        LIMIT 500
    ) i;

    -- Likes
    SELECT count(*) INTO v_likes_count FROM likes WHERE capsule_id = p_capsule_id;
    SELECT EXISTS(SELECT 1 FROM likes WHERE capsule_id = p_capsule_id AND user_id = v_user_id) INTO v_is_liked;

    -- Invites
    SELECT jsonb_agg(inv) INTO v_invites FROM (
        SELECT ci.id, ci.capsule_id, ci.user_id, ci.status, ci.cover_url,
               jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'favorite_color', p.favorite_color) as profiles
        FROM capsule_invites ci
        JOIN profiles p ON p.id = ci.user_id
        WHERE ci.capsule_id = p_capsule_id
    ) inv;

    -- Comments (First 15 for instant view)
    SELECT jsonb_agg(cms) INTO v_comments FROM (
        SELECT c.id, c.capsule_id, c.user_id, c.content, c.created_at,
               jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'is_verified', p.is_verified, 'favorite_color', p.favorite_color) as profiles,
               (SELECT count(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as like_count,
               EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = v_user_id) as my_like
        FROM comments c
        JOIN profiles p ON p.id = c.user_id
        WHERE c.capsule_id = p_capsule_id
        ORDER BY c.created_at DESC
        LIMIT 15
    ) cms;

    -- Follows context
    SELECT count(*) INTO v_owner_followers_count FROM follows WHERE following_id = (v_capsule->>'owner_id')::uuid;
    SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = v_user_id AND following_id = (v_capsule->>'owner_id')::uuid) INTO v_is_followed_owner;
    
    SELECT count(*) INTO v_capsule_followers_count FROM capsule_followers WHERE capsule_id = p_capsule_id;
    SELECT EXISTS(SELECT 1 FROM capsule_followers WHERE user_id = v_user_id AND capsule_id = p_capsule_id) INTO v_is_followed_capsule;

    RETURN jsonb_build_object(
        'capsule', v_capsule,
        'items', COALESCE(v_items, '[]'::jsonb),
        'likes_count', v_likes_count,
        'is_liked', v_is_liked,
        'invites', COALESCE(v_invites, '[]'::jsonb),
        'latest_comments', COALESCE(v_comments, '[]'::jsonb),
        'owner_followers_count', v_owner_followers_count,
        'is_followed_owner', v_is_followed_owner,
        'capsule_followers_count', v_capsule_followers_count,
        'is_followed_capsule', v_is_followed_capsule
    );
END;
$$ LANGUAGE plpgsql STABLE;
