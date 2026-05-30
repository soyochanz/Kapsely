-- Update request_capsule_open_v4 to require all member votes and start a 30s shared opening countdown
CREATE OR REPLACE FUNCTION request_capsule_open_v4(target_capsule_id UUID, requester_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_open_requests UUID[];
    v_members_count INTEGER;
    v_is_opening BOOLEAN := FALSE;
    v_opening_at TIMESTAMP WITH TIME ZONE;
    v_is_first_vote BOOLEAN := FALSE;
BEGIN
    -- 1. Get current open_requests
    SELECT open_requests INTO v_open_requests 
    FROM capsules WHERE id = target_capsule_id;

    -- 2. Check if this is the first vote (will be 1 after update if it was empty/null)
    IF v_open_requests IS NULL OR ARRAY_LENGTH(v_open_requests, 1) = 0 THEN
        v_is_first_vote := TRUE;
    END IF;

    -- 3. Update open_requests array (add requester if not present)
    IF NOT (requester_user_id = ANY(COALESCE(v_open_requests, ARRAY[]::UUID[]))) THEN
        UPDATE capsules
        SET open_requests = ARRAY_APPEND(COALESCE(open_requests, ARRAY[]::UUID[]), requester_user_id)
        WHERE id = target_capsule_id
        RETURNING open_requests INTO v_open_requests;
    END IF;

    -- 4. Calculate total members (Owner + Accepted Invites)
    SELECT count(*) + 1 INTO v_members_count
    FROM capsule_invites
    WHERE capsule_id = target_capsule_id AND status = 'accepted';

    -- 5. Shared capsules open only when every member has voted
    IF ARRAY_LENGTH(v_open_requests, 1) >= v_members_count THEN
        v_is_opening := TRUE;
        v_opening_at := now() + interval '30 seconds';
        
        UPDATE capsules
        SET is_opening = TRUE, opening_at = v_opening_at
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
