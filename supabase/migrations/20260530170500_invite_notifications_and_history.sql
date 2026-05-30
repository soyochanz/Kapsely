-- Keep notification history available and guarantee capsule invite notifications.

DROP TRIGGER IF EXISTS on_notification_created_clean ON public.notifications;

CREATE OR REPLACE FUNCTION public.handle_capsule_invite_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RETURN NEW;
    END IF;

    SELECT owner_id
      INTO v_owner_id
      FROM public.capsules
     WHERE id = NEW.capsule_id;

    IF v_owner_id IS NULL OR NEW.user_id IS NULL OR NEW.user_id = v_owner_id THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message, is_read)
    SELECT
        NEW.user_id,
        v_owner_id,
        'capsule_invite',
        NEW.capsule_id,
        'detail.invited_you_to_capsule',
        FALSE
    WHERE NOT EXISTS (
        SELECT 1
          FROM public.notifications n
         WHERE n.user_id = NEW.user_id
           AND n.sender_id = v_owner_id
           AND n.type = 'capsule_invite'
           AND n.capsule_id = NEW.capsule_id
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_capsule_invite_created_notify ON public.capsule_invites;
CREATE TRIGGER on_capsule_invite_created_notify
AFTER INSERT OR UPDATE OF status ON public.capsule_invites
FOR EACH ROW
EXECUTE FUNCTION public.handle_capsule_invite_notification();

INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message, is_read)
SELECT
    ci.user_id,
    c.owner_id,
    'capsule_invite',
    ci.capsule_id,
    'detail.invited_you_to_capsule',
    FALSE
FROM public.capsule_invites ci
JOIN public.capsules c ON c.id = ci.capsule_id
WHERE ci.status = 'pending'
  AND ci.user_id <> c.owner_id
  AND NOT EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.user_id = ci.user_id
         AND n.sender_id = c.owner_id
         AND n.type = 'capsule_invite'
         AND n.capsule_id = ci.capsule_id
  );

COMMENT ON FUNCTION public.handle_capsule_invite_notification() IS
    'Creates a notification for every pending capsule invite, independent of client-side notification inserts.';
