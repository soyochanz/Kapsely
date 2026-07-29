-- Shared capsule opening and leaving rules.
-- - Opening requests are counted across active members.
-- - A shared capsule opens when every active member has voted.
-- - If at least one member voted and 48 hours pass, it opens automatically.
-- - Leaving transfers ownership when the owner leaves, and deletes only when no members remain.

ALTER TABLE public.capsules
ADD COLUMN IF NOT EXISTS first_open_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_capsule_open_v4(target_capsule_id uuid, requester_user_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_open_requests uuid[];
    v_members_count integer;
    v_is_opening boolean := false;
    v_opening_at timestamptz;
    v_is_first_vote boolean := false;
    v_owner_id uuid;
    v_status text;
    v_is_member boolean := false;
BEGIN
    SELECT owner_id, status, open_requests
    INTO v_owner_id, v_status, v_open_requests
    FROM public.capsules
    WHERE id = target_capsule_id
    FOR UPDATE;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Capsule not found';
    END IF;

    IF v_status = 'opened' THEN
        RETURN jsonb_build_object(
            'open_requests', COALESCE(v_open_requests, ARRAY[]::uuid[]),
            'is_opening', false,
            'opening_at', null,
            'is_first_vote', false,
            'members_count', 1,
            'required_votes', 1
        );
    END IF;

    v_is_member := requester_user_id = v_owner_id OR EXISTS (
        SELECT 1
        FROM public.capsule_invites ci
        WHERE ci.capsule_id = target_capsule_id
          AND ci.user_id = requester_user_id
          AND ci.status = 'accepted'
    );

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Only capsule members can request opening';
    END IF;

    IF COALESCE(array_length(v_open_requests, 1), 0) = 0 THEN
        v_is_first_vote := true;
    END IF;

    IF NOT (requester_user_id = ANY(COALESCE(v_open_requests, ARRAY[]::uuid[]))) THEN
        UPDATE public.capsules
        SET open_requests = array_append(COALESCE(open_requests, ARRAY[]::uuid[]), requester_user_id),
            first_open_requested_at = COALESCE(first_open_requested_at, now())
        WHERE id = target_capsule_id
        RETURNING open_requests INTO v_open_requests;
    END IF;

    SELECT count(*) + 1
    INTO v_members_count
    FROM public.capsule_invites
    WHERE capsule_id = target_capsule_id
      AND status = 'accepted';

    IF COALESCE(array_length(v_open_requests, 1), 0) >= v_members_count THEN
        v_is_opening := true;
        v_opening_at := now() + interval '30 seconds';

        UPDATE public.capsules
        SET is_opening = true,
            opening_at = v_opening_at,
            opening_preview_by = null,
            opening_preview_started_at = null,
            opening_preview_expires_at = null
        WHERE id = target_capsule_id;
    END IF;

    RETURN jsonb_build_object(
        'open_requests', COALESCE(v_open_requests, ARRAY[]::uuid[]),
        'is_opening', v_is_opening,
        'opening_at', v_opening_at,
        'is_first_vote', v_is_first_vote,
        'members_count', v_members_count,
        'required_votes', v_members_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.open_shared_capsules_after_vote_timeout_v1()
RETURNS integer AS $$
DECLARE
    v_opened_count integer := 0;
BEGIN
    UPDATE public.capsules
    SET status = 'opened',
        is_opening = false,
        opening_at = null,
        opening_preview_by = null,
        opening_preview_started_at = null,
        opening_preview_expires_at = null
    WHERE status = 'sealed'
      AND COALESCE(is_shared, false) = true
      AND (
          (COALESCE(is_opening, false) = true AND opening_at IS NOT NULL AND opening_at <= now())
          OR (
              COALESCE(array_length(open_requests, 1), 0) > 0
              AND first_open_requested_at IS NOT NULL
              AND first_open_requested_at <= now() - interval '48 hours'
          )
      );

    GET DIAGNOSTICS v_opened_count = ROW_COUNT;
    RETURN v_opened_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.leave_capsule_v1(target_capsule_id uuid, requester_user_id uuid DEFAULT auth.uid())
RETURNS jsonb AS $$
DECLARE
    v_owner_id uuid;
    v_new_owner_id uuid;
    v_was_owner boolean;
    v_remaining_count integer;
BEGIN
    IF requester_user_id IS NULL OR requester_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT owner_id
    INTO v_owner_id
    FROM public.capsules
    WHERE id = target_capsule_id
    FOR UPDATE;

    IF v_owner_id IS NULL THEN
        RETURN jsonb_build_object('status', 'missing');
    END IF;

    IF requester_user_id <> v_owner_id AND NOT EXISTS (
        SELECT 1
        FROM public.capsule_invites
        WHERE capsule_id = target_capsule_id
          AND user_id = requester_user_id
          AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'Not a capsule member';
    END IF;

    v_was_owner := requester_user_id = v_owner_id;

    IF NOT v_was_owner THEN
        DELETE FROM public.capsule_invites
        WHERE capsule_id = target_capsule_id
          AND user_id = requester_user_id;

        UPDATE public.capsules
        SET open_requests = array_remove(COALESCE(open_requests, ARRAY[]::uuid[]), requester_user_id)
        WHERE id = target_capsule_id;
    ELSE
        SELECT user_id
        INTO v_new_owner_id
        FROM public.capsule_invites
        WHERE capsule_id = target_capsule_id
          AND status = 'accepted'
        ORDER BY created_at NULLS LAST, user_id
        LIMIT 1;

        IF v_new_owner_id IS NULL THEN
            DELETE FROM public.capsules
            WHERE id = target_capsule_id;

            RETURN jsonb_build_object('status', 'deleted', 'was_owner', true);
        END IF;

        DELETE FROM public.capsule_invites
        WHERE capsule_id = target_capsule_id
          AND user_id = v_new_owner_id;

        UPDATE public.capsules
        SET owner_id = v_new_owner_id,
            open_requests = array_remove(COALESCE(open_requests, ARRAY[]::uuid[]), requester_user_id),
            is_shared = EXISTS (
                SELECT 1
                FROM public.capsule_invites
                WHERE capsule_id = target_capsule_id
                  AND status = 'accepted'
            )
        WHERE id = target_capsule_id;
    END IF;

    SELECT count(*) + 1
    INTO v_remaining_count
    FROM public.capsule_invites
    WHERE capsule_id = target_capsule_id
      AND status = 'accepted';

    RETURN jsonb_build_object(
        'status', 'left',
        'was_owner', v_was_owner,
        'new_owner_id', v_new_owner_id,
        'remaining_members', v_remaining_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_capsule_open_v4(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_shared_capsules_after_vote_timeout_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_capsule_v1(uuid, uuid) TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'open-shared-capsules-after-vote-timeout-v1') THEN
            PERFORM cron.schedule(
                'open-shared-capsules-after-vote-timeout-v1',
                '*/10 * * * *',
                'SELECT public.open_shared_capsules_after_vote_timeout_v1();'
            );
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
