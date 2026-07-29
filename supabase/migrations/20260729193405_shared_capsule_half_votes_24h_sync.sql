-- Shared capsules open when at least half of their active members vote.
-- With fewer votes (including zero), they open 24 hours after creation.

CREATE OR REPLACE FUNCTION public.request_capsule_open_v4(target_capsule_id uuid, requester_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_open_requests uuid[];
    v_valid_vote_count integer;
    v_members_count integer;
    v_required_votes integer;
    v_is_opening boolean := false;
    v_opening_at timestamptz;
    v_is_first_vote boolean := false;
    v_owner_id uuid;
    v_status text;
BEGIN
    IF requester_user_id IS NULL OR auth.uid() IS NULL OR requester_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT owner_id, status, COALESCE(open_requests, ARRAY[]::uuid[])
    INTO v_owner_id, v_status, v_open_requests
    FROM public.capsules
    WHERE id = target_capsule_id
    FOR UPDATE;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Capsule not found';
    END IF;

    SELECT count(*) + 1
    INTO v_members_count
    FROM public.capsule_invites
    WHERE capsule_id = target_capsule_id AND status = 'accepted';

    v_required_votes := GREATEST(1, (v_members_count + 1) / 2);

    IF v_status = 'opened' THEN
        RETURN jsonb_build_object(
            'open_requests', v_open_requests, 'is_opening', false,
            'opening_at', null, 'is_first_vote', false,
            'members_count', v_members_count, 'required_votes', v_required_votes
        );
    END IF;

    IF requester_user_id <> v_owner_id AND NOT EXISTS (
        SELECT 1 FROM public.capsule_invites
        WHERE capsule_id = target_capsule_id
          AND user_id = requester_user_id
          AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'Only capsule members can request opening';
    END IF;

    v_is_first_vote := COALESCE(array_length(v_open_requests, 1), 0) = 0;

    IF NOT (requester_user_id = ANY(v_open_requests)) THEN
        v_open_requests := array_append(v_open_requests, requester_user_id);
        UPDATE public.capsules
        SET open_requests = v_open_requests,
            first_open_requested_at = COALESCE(first_open_requested_at, now())
        WHERE id = target_capsule_id;
    END IF;

    SELECT count(*)
    INTO v_valid_vote_count
    FROM unnest(v_open_requests) AS vote(user_id)
    WHERE vote.user_id = v_owner_id
       OR EXISTS (
            SELECT 1 FROM public.capsule_invites
            WHERE capsule_id = target_capsule_id
              AND user_id = vote.user_id
              AND status = 'accepted'
       );

    IF v_valid_vote_count >= v_required_votes THEN
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
        'open_requests', v_open_requests, 'is_opening', v_is_opening,
        'opening_at', v_opening_at, 'is_first_vote', v_is_first_vote,
        'members_count', v_members_count, 'required_votes', v_required_votes
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_shared_capsules_after_vote_timeout_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opened_count integer;
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
          OR created_at <= now() - interval '24 hours'
      );
    GET DIAGNOSTICS v_opened_count = ROW_COUNT;
    RETURN v_opened_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_shared_capsule_opening_v1(target_capsule_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_count integer;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.capsules c
        WHERE c.id = target_capsule_id
          AND (
              c.owner_id = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM public.capsule_invites ci
                  WHERE ci.capsule_id = c.id
                    AND ci.user_id = auth.uid()
                    AND ci.status = 'accepted'
              )
          )
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.capsules
    SET status = 'opened',
        is_opening = false,
        opening_at = null,
        opening_preview_by = null,
        opening_preview_started_at = null,
        opening_preview_expires_at = null
    WHERE id = target_capsule_id
      AND status = 'sealed'
      AND COALESCE(is_shared, false) = true
      AND (
          (COALESCE(is_opening, false) = true AND opening_at IS NOT NULL AND opening_at <= now())
          OR created_at <= now() - interval '24 hours'
      );
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.request_capsule_open_v4(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_shared_capsule_opening_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_shared_capsules_after_vote_timeout_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_capsule_open_v4(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_shared_capsule_opening_v1(uuid) TO authenticated;

DO $$
DECLARE
    v_job_id bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        SELECT jobid INTO v_job_id
        FROM cron.job
        WHERE jobname = 'open-shared-capsules-after-vote-timeout-v1'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'open-shared-capsules-after-vote-timeout-v1',
            '* * * * *',
            'SELECT public.open_shared_capsules_after_vote_timeout_v1();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not configure shared capsule cron job: %', SQLERRM;
END;
$$;
