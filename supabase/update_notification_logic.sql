-- 1. Function to handle notifications when a new item is added to a capsule
-- This replaces the previous logic that notified user followers.
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

-- 2. (Optional) Re-bind the trigger to the capsule_items table
-- Drop if exists to avoid duplicates
DROP TRIGGER IF EXISTS on_capsule_item_created ON public.capsule_items;

CREATE TRIGGER on_capsule_item_created
AFTER INSERT ON public.capsule_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_capsule_item_notification();


-- 3. Disable notifications for general "user followed created a capsule" 
-- If you have a trigger like 'on_capsule_created' that notifies followers of the user,
-- you should find and drop it or update it. 
-- Example of disabling it:
-- DROP TRIGGER IF EXISTS on_capsule_created_notify_followers ON public.capsules;

-- 4. Ensure we have the 'new_item' message in the localizations or just use a generic one.
-- The trigger above uses a hardcoded English message for now, but the app can map 'new_item' type 
-- to any translation in NotificationsScreen.tsx.

COMMENT ON FUNCTION public.handle_new_capsule_item_notification() IS 'Notifies capsule followers instead of user followers when new content is added.';
