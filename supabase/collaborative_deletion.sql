-- COLLABORATIVE DELETION LOGIC
-- 1. Create table to track deletion votes
CREATE TABLE IF NOT EXISTS public.capsule_delete_votes (
    capsule_id UUID REFERENCES public.capsules(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (capsule_id, user_id)
);

-- 2. Function to register a vote and check if deletion criteria is met
CREATE OR REPLACE FUNCTION vote_delete_capsule(p_capsule_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_member_count INT;
    v_votes JSONB;
    v_is_shared BOOLEAN;
    v_owner_id UUID;
BEGIN
    -- 1. Get capsule info
    SELECT is_shared, owner_id INTO v_is_shared, v_owner_id 
    FROM public.capsules 
    WHERE id = p_capsule_id;

    IF v_owner_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Capsule not found');
    END IF;

    -- 2. Verify if user is owner or an accepted member
    IF v_user_id != v_owner_id AND NOT EXISTS (
        SELECT 1 FROM public.capsule_invites 
        WHERE capsule_id = p_capsule_id AND user_id = v_user_id AND status = 'accepted'
    ) THEN
        RETURN jsonb_build_object('error', 'Not authorized');
    END IF;

    -- 3. Get total members (Owner + Accepted Invites)
    SELECT count(*) + 1 INTO v_member_count 
    FROM public.capsule_invites 
    WHERE capsule_id = p_capsule_id AND status = 'accepted';

    -- 4. Register the vote
    INSERT INTO public.capsule_delete_votes (capsule_id, user_id)
    VALUES (p_capsule_id, v_user_id)
    ON CONFLICT (capsule_id, user_id) DO NOTHING;

    -- 5. Get current votes as array
    SELECT COALESCE(jsonb_agg(user_id), '[]'::jsonb) INTO v_votes 
    FROM public.capsule_delete_votes 
    WHERE capsule_id = p_capsule_id;

    -- 6. Check if everyone voted
    IF jsonb_array_length(v_votes) >= v_member_count THEN
        -- Proceed with full deletion
        DELETE FROM public.capsules WHERE id = p_capsule_id;
        RETURN jsonb_build_object('status', 'deleted');
    ELSE
        RETURN jsonb_build_object(
            'status', 'voted',
            'delete_requests', v_votes,
            'total_members', v_member_count
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
