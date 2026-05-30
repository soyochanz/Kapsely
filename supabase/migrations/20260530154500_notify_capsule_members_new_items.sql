-- Notify accepted capsule members when someone uploads content to a capsule.

CREATE OR REPLACE FUNCTION public.handle_new_capsule_item_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message, is_read)
    SELECT DISTINCT
        recipients.user_id,
        NEW.owner_id,
        'new_item',
        NEW.capsule_id,
        'added new content to a capsule you follow',
        FALSE
    FROM (
        SELECT cf.user_id
          FROM public.capsule_followers cf
         WHERE cf.capsule_id = NEW.capsule_id

        UNION

        SELECT ci.user_id
          FROM public.capsule_invites ci
         WHERE ci.capsule_id = NEW.capsule_id
           AND ci.status = 'accepted'
    ) recipients
    WHERE recipients.user_id <> NEW.owner_id
      AND NOT EXISTS (
          SELECT 1
            FROM public.notifications n
           WHERE n.user_id = recipients.user_id
             AND n.sender_id = NEW.owner_id
             AND n.type = 'new_item'
             AND n.capsule_id = NEW.capsule_id
             AND n.created_at > NOW() - INTERVAL '1 minute'
      );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_capsule_item_created ON public.capsule_items;
CREATE TRIGGER on_capsule_item_created
AFTER INSERT ON public.capsule_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_capsule_item_notification();

COMMENT ON FUNCTION public.handle_new_capsule_item_notification() IS
    'Notifies capsule followers and accepted capsule members when new content is added.';
