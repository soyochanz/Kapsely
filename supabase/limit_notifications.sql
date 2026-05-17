-- Function to limit notifications to 30 per user
-- When a new notification is inserted, it removes the oldest ones if the count exceeds 30.

CREATE OR REPLACE FUNCTION public.clean_old_notifications()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE user_id = NEW.user_id
    AND id NOT IN (
        SELECT id
        FROM public.notifications
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        LIMIT 30
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to the notifications table
DROP TRIGGER IF EXISTS on_notification_created_clean ON public.notifications;
CREATE TRIGGER on_notification_created_clean
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.clean_old_notifications();

COMMENT ON FUNCTION public.clean_old_notifications() IS 'Keeps only the most recent 30 notifications per user to prevent database bloat.';
