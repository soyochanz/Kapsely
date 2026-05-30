ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_account_deletion_due
ON public.profiles(deletion_scheduled_at)
WHERE account_status = 'deletion_pending';

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_scheduled_at timestamptz := now() + interval '10 days';
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.profiles
    SET
        account_status = 'deletion_pending',
        deletion_requested_at = COALESCE(deletion_requested_at, now()),
        deletion_scheduled_at = COALESCE(deletion_scheduled_at, v_scheduled_at),
        active_conversation_id = NULL,
        push_notifications_enabled = false,
        push_notif_comments = false,
        push_notif_invites = false,
        push_token = NULL
    WHERE id = v_user_id;

    DELETE FROM public.user_push_tokens WHERE user_id = v_user_id;
    DELETE FROM public.blocks WHERE blocker_id = v_user_id OR blocked_id = v_user_id;
    DELETE FROM public.follows WHERE follower_id = v_user_id OR following_id = v_user_id;

    RETURN jsonb_build_object(
        'status', 'deletion_pending',
        'scheduled_at', (SELECT deletion_scheduled_at FROM public.profiles WHERE id = v_user_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.profiles
    SET
        account_status = 'active',
        deletion_requested_at = NULL,
        deletion_scheduled_at = NULL
    WHERE id = v_user_id
      AND account_status = 'deletion_pending';

    RETURN jsonb_build_object('status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.process_due_account_deletions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user record;
    v_capsule record;
    v_new_owner uuid;
    v_deleted_users integer := 0;
    v_deleted_capsules integer := 0;
    v_preserved_capsules integer := 0;
BEGIN
    FOR v_user IN
        SELECT id
        FROM public.profiles
        WHERE account_status = 'deletion_pending'
          AND deletion_scheduled_at <= now()
        ORDER BY deletion_scheduled_at ASC
    LOOP
        UPDATE public.profiles
        SET account_status = 'deleting'
        WHERE id = v_user.id;

        DELETE FROM public.capsule_invites
        WHERE user_id = v_user.id;

        FOR v_capsule IN
            SELECT id
            FROM public.capsules
            WHERE owner_id = v_user.id
        LOOP
            SELECT ci.user_id
            INTO v_new_owner
            FROM public.capsule_invites ci
            JOIN public.profiles p ON p.id = ci.user_id
            WHERE ci.capsule_id = v_capsule.id
              AND ci.status = 'accepted'
              AND COALESCE(p.account_status, 'active') = 'active'
            ORDER BY ci.created_at ASC
            LIMIT 1;

            IF v_new_owner IS NULL THEN
                DELETE FROM public.capsules WHERE id = v_capsule.id;
                v_deleted_capsules := v_deleted_capsules + 1;
            ELSE
                UPDATE public.capsules
                SET
                    owner_id = v_new_owner,
                    is_shared = true,
                    invited_user_id = NULL,
                    invite_status = NULL
                WHERE id = v_capsule.id;
                v_preserved_capsules := v_preserved_capsules + 1;
            END IF;
        END LOOP;

        DELETE FROM public.capsule_items WHERE owner_id = v_user.id;
        DELETE FROM public.comments WHERE user_id = v_user.id;
        DELETE FROM public.comment_likes WHERE user_id = v_user.id;
        DELETE FROM public.likes WHERE user_id = v_user.id;
        DELETE FROM public.story_reads WHERE user_id = v_user.id;
        DELETE FROM public.story_likes WHERE user_id = v_user.id;
        DELETE FROM public.story_comments WHERE user_id = v_user.id;
        DELETE FROM public.birthday_congratulations WHERE profile_id = v_user.id OR sender_id = v_user.id;
        DELETE FROM public.notifications WHERE user_id = v_user.id OR sender_id = v_user.id;
        DELETE FROM public.conversation_participants WHERE user_id = v_user.id;
        DELETE FROM public.messages WHERE sender_id = v_user.id;
        DELETE FROM public.capsule_followers WHERE user_id = v_user.id;
        DELETE FROM public.user_push_tokens WHERE user_id = v_user.id;
        DELETE FROM public.follows WHERE follower_id = v_user.id OR following_id = v_user.id;
        DELETE FROM public.blocks WHERE blocker_id = v_user.id OR blocked_id = v_user.id;
        DELETE FROM public.profile_stickers WHERE user_id = v_user.id;
        DELETE FROM public.user_stickers WHERE user_id = v_user.id;

        UPDATE public.profiles
        SET
            account_status = 'deleted',
            deleted_at = now()
        WHERE id = v_user.id;

        DELETE FROM public.profiles WHERE id = v_user.id;
        DELETE FROM auth.users WHERE id = v_user.id;

        v_deleted_users := v_deleted_users + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'deleted_users', v_deleted_users,
        'deleted_capsules', v_deleted_capsules,
        'preserved_shared_capsules', v_preserved_capsules
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;
REVOKE ALL ON FUNCTION public.process_due_account_deletions() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('process_due_account_deletions');
        PERFORM cron.schedule(
            'process_due_account_deletions',
            '17 * * * *',
            'SELECT public.process_due_account_deletions();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
