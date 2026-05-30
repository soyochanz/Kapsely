CREATE OR REPLACE FUNCTION public.request_capsule_open_v4(target_capsule_id UUID, requester_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_open_requests UUID[];
    v_members_count INTEGER;
    v_is_opening BOOLEAN := FALSE;
    v_opening_at TIMESTAMP WITH TIME ZONE;
    v_is_first_vote BOOLEAN := FALSE;
BEGIN
    SELECT open_requests
    INTO v_open_requests
    FROM public.capsules
    WHERE id = target_capsule_id;

    IF v_open_requests IS NULL OR ARRAY_LENGTH(v_open_requests, 1) = 0 THEN
        v_is_first_vote := TRUE;
    END IF;

    IF NOT (requester_user_id = ANY(COALESCE(v_open_requests, ARRAY[]::UUID[]))) THEN
        UPDATE public.capsules
        SET open_requests = ARRAY_APPEND(COALESCE(open_requests, ARRAY[]::UUID[]), requester_user_id)
        WHERE id = target_capsule_id
        RETURNING open_requests INTO v_open_requests;
    END IF;

    SELECT count(*) + 1
    INTO v_members_count
    FROM public.capsule_invites
    WHERE capsule_id = target_capsule_id
      AND status = 'accepted';

    IF ARRAY_LENGTH(v_open_requests, 1) >= v_members_count THEN
        v_is_opening := TRUE;
        v_opening_at := now() + interval '30 seconds';

        UPDATE public.capsules
        SET is_opening = TRUE,
            opening_at = v_opening_at,
            opening_preview_by = NULL,
            opening_preview_started_at = NULL,
            opening_preview_expires_at = NULL
        WHERE id = target_capsule_id;
    END IF;

    RETURN jsonb_build_object(
        'open_requests', v_open_requests,
        'is_opening', v_is_opening,
        'opening_at', v_opening_at,
        'is_first_vote', v_is_first_vote
    );
END;
$$ LANGUAGE plpgsql;
