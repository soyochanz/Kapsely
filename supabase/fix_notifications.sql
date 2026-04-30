-- Function to handle notifications when a new item is added to a capsule
-- This replaces any logic that notified user followers.
-- Now it ONLY notifies users who follow the specific capsule.

CREATE OR REPLACE FUNCTION public.handle_new_capsule_item_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify all users who follow this specific capsule
    -- Exclude the person who uploaded the item
    INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message)
    SELECT 
        cf.user_id, 
        NEW.owner_id, 
        'new_item', 
        NEW.capsule_id, 
        'added new content to a capsule you follow'
    FROM public.capsule_followers cf
    WHERE cf.capsule_id = NEW.capsule_id
      AND cf.user_id != NEW.owner_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-bind the trigger to the capsule_items table
DROP TRIGGER IF EXISTS on_capsule_item_created ON public.capsule_items;
CREATE TRIGGER on_capsule_item_created
AFTER INSERT ON public.capsule_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_capsule_item_notification();

-- CRITICAL: Disable notifications for general "user followed created a capsule"
-- The user requested ONLY notifications for capsules you follow, not for users you follow.
DROP TRIGGER IF EXISTS on_capsule_created ON public.capsules;
DROP TRIGGER IF EXISTS on_capsule_created_notify_followers ON public.capsules;

-- 3. Automatically make owner follow their own capsule
CREATE OR REPLACE FUNCTION public.handle_capsule_owner_auto_follow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.capsule_followers (user_id, capsule_id)
    VALUES (NEW.owner_id, NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_capsule_owner_auto_follow ON public.capsules;
CREATE TRIGGER on_capsule_owner_auto_follow
AFTER INSERT ON public.capsules
FOR EACH ROW
EXECUTE FUNCTION public.handle_capsule_owner_auto_follow();

COMMENT ON FUNCTION public.handle_new_capsule_item_notification() IS 'Notifies capsule followers instead of user followers when new content is added.';
