-- Capsule invitations expire after 48 hours and become rejected.

ALTER TABLE public.capsule_invites
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_capsule_invite_48h_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'pending' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending' THEN
            NEW.expires_at := NOW() + INTERVAL '48 hours';
        ELSE
            NEW.expires_at := COALESCE(NEW.expires_at, NOW() + INTERVAL '48 hours');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_capsule_invite_set_48h_expiry ON public.capsule_invites;
CREATE TRIGGER on_capsule_invite_set_48h_expiry
BEFORE INSERT OR UPDATE OF status ON public.capsule_invites
FOR EACH ROW
EXECUTE FUNCTION public.set_capsule_invite_48h_expiry();

CREATE OR REPLACE FUNCTION public.reject_expired_capsule_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rejected_count INTEGER := 0;
BEGIN
    UPDATE public.capsule_invites
       SET status = 'rejected'
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW();

    GET DIAGNOSTICS v_rejected_count = ROW_COUNT;
    RETURN v_rejected_count;
END;
$$;

UPDATE public.capsule_invites
   SET expires_at = NOW() + INTERVAL '48 hours'
 WHERE status = 'pending'
   AND expires_at IS NULL;

SELECT public.reject_expired_capsule_invites();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule(jobid)
            FROM cron.job
            WHERE jobname = 'reject-expired-capsule-invites';
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        PERFORM cron.schedule(
            'reject-expired-capsule-invites',
            '*/10 * * * *',
            'SELECT public.reject_expired_capsule_invites();'
        );
    END IF;
END $$;

COMMENT ON FUNCTION public.reject_expired_capsule_invites() IS
    'Rejects pending capsule invitations once their 48-hour expires_at timestamp has passed.';
