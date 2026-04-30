-- 1. Table to track sent reminders
CREATE TABLE IF NOT EXISTS public.event_reminders_sent (
    capsule_id UUID NOT NULL REFERENCES public.capsules(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL, -- '24h'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (capsule_id, reminder_type)
);

-- 2. Trigger for NEW CAPSULE notification
CREATE OR REPLACE FUNCTION public.handle_new_capsule_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify all followers of the creator
    INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message)
    SELECT 
        f.follower_id, 
        NEW.owner_id, 
        'new_capsule', 
        NEW.id, 
        'ha creado una nueva cápsula'
    FROM public.follows f
    WHERE f.following_id = NEW.owner_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_capsule_created ON public.capsules;
CREATE TRIGGER on_capsule_created
AFTER INSERT ON public.capsules
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_capsule_notification();

-- 3. Function to check for 24h reminders (to be called via Cron or Edge Function)
CREATE OR REPLACE FUNCTION public.check_event_reminders()
RETURNS VOID AS $$
DECLARE
    v_capsule RECORD;
BEGIN
    FOR v_capsule IN 
        SELECT c.id, c.owner_id, c.title, c.opens_at
        FROM public.capsules c
        LEFT JOIN public.event_reminders_sent ers ON ers.capsule_id = c.id AND ers.reminder_type = '24h'
        WHERE c.status = 'sealed'
          AND c.opens_at > now()
          AND c.opens_at < (now() + interval '24 hours')
          AND ers.capsule_id IS NULL
    LOOP
        -- Notify capsule followers
        INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message)
        SELECT 
            cf.user_id, 
            v_capsule.owner_id, 
            'event_reminder_24h', 
            v_capsule.id, 
            'última oportunidad para añadir contenido a ' || v_capsule.title
        FROM public.capsule_followers cf
        WHERE cf.capsule_id = v_capsule.id;

        -- Mark as sent
        INSERT INTO public.event_reminders_sent (capsule_id, reminder_type)
        VALUES (v_capsule.id, '24h');
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
