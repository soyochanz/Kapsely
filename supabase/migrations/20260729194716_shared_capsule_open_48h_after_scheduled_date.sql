-- Correct the fallback window: it starts at the capsule's scheduled opening
-- date (opens_at), not at capsule creation. Voting still opens at 50%.

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
          (
              COALESCE(is_opening, false) = true
              AND opening_at IS NOT NULL
              AND opening_at <= now()
          )
          OR (
              opens_at IS NOT NULL
              AND opens_at <= now() - interval '48 hours'
          )
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
                  SELECT 1
                  FROM public.capsule_invites ci
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
          (
              COALESCE(is_opening, false) = true
              AND opening_at IS NOT NULL
              AND opening_at <= now()
          )
          OR (
              opens_at IS NOT NULL
              AND opens_at <= now() - interval '48 hours'
          )
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_shared_capsule_opening_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_shared_capsules_after_vote_timeout_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_shared_capsule_opening_v1(uuid) TO authenticated;
