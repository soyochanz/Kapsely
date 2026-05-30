CREATE OR REPLACE FUNCTION public.prevent_ready_sealed_capsule_uploads()
RETURNS trigger AS $$
DECLARE
    v_status text;
    v_is_opening boolean;
    v_opens_at timestamptz;
BEGIN
    SELECT status, is_opening, opens_at
    INTO v_status, v_is_opening, v_opens_at
    FROM public.capsules
    WHERE id = NEW.capsule_id;

    IF v_status = 'sealed'
       AND (
           COALESCE(v_is_opening, false) = true
           OR (v_opens_at IS NOT NULL AND v_opens_at <= now())
       ) THEN
        RAISE EXCEPTION 'This sealed capsule is already ready to open and does not accept more content.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_capsule_item_insert_prevent_ready_sealed ON public.capsule_items;
CREATE TRIGGER before_capsule_item_insert_prevent_ready_sealed
BEFORE INSERT ON public.capsule_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_ready_sealed_capsule_uploads();

CREATE OR REPLACE FUNCTION public.cleanup_empty_ready_sealed_capsules()
RETURNS integer AS $$
DECLARE
    v_deleted_count integer := 0;
BEGIN
    WITH doomed AS (
        SELECT c.id, c.owner_id, c.title
        FROM public.capsules c
        WHERE c.status = 'sealed'
          AND c.opens_at IS NOT NULL
          AND c.opens_at <= now()
          AND NOT EXISTS (
              SELECT 1
              FROM public.capsule_items ci
              WHERE ci.capsule_id = c.id
          )
    ),
    recipients AS (
        SELECT DISTINCT d.id AS capsule_id, d.owner_id AS sender_id, d.title, d.owner_id AS user_id
        FROM doomed d
        UNION
        SELECT DISTINCT d.id AS capsule_id, d.owner_id AS sender_id, d.title, ci.user_id
        FROM doomed d
        JOIN public.capsule_invites ci
          ON ci.capsule_id = d.id
         AND ci.status = 'accepted'
        UNION
        SELECT DISTINCT d.id AS capsule_id, d.owner_id AS sender_id, d.title, cf.user_id
        FROM doomed d
        JOIN public.capsule_followers cf
          ON cf.capsule_id = d.id
    ),
    inserted_notifications AS (
        INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message, is_read)
        SELECT
            r.user_id,
            r.sender_id,
            'capsule_deleted_empty',
            NULL,
            'notifications.capsule_deleted_empty',
            false
        FROM recipients r
        RETURNING id
    ),
    deleted_capsules AS (
        DELETE FROM public.capsules c
        USING doomed d
        WHERE c.id = d.id
        RETURNING c.id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted_capsules;

    RETURN COALESCE(v_deleted_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.notify_followed_capsules_opening_soon()
RETURNS integer AS $$
DECLARE
    v_inserted_count integer := 0;
BEGIN
    WITH candidates AS (
        SELECT c.id, c.owner_id, c.title, c.opens_at
        FROM public.capsules c
        WHERE c.status = 'sealed'
          AND c.opens_at IS NOT NULL
          AND c.opens_at > now()
          AND c.opens_at <= now() + interval '1 hour'
          AND c.opens_at > now() + interval '55 minutes'
          AND EXISTS (
              SELECT 1
              FROM public.capsule_items ci
              WHERE ci.capsule_id = c.id
          )
    ),
    inserted AS (
        INSERT INTO public.notifications (user_id, sender_id, type, capsule_id, message, is_read)
        SELECT
            cf.user_id,
            c.owner_id,
            'opening_soon',
            c.id,
            'notifications.capsule_opening_soon',
            false
        FROM candidates c
        JOIN public.capsule_followers cf
          ON cf.capsule_id = c.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.notifications n
            WHERE n.user_id = cf.user_id
              AND n.capsule_id = c.id
              AND n.type = 'opening_soon'
              AND n.created_at > now() - interval '2 hours'
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_inserted_count FROM inserted;

    RETURN COALESCE(v_inserted_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule(jobid)
            FROM cron.job
            WHERE jobname = 'cleanup-empty-ready-sealed-capsules';
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        BEGIN
            PERFORM cron.unschedule(jobid)
            FROM cron.job
            WHERE jobname = 'notify-followed-capsules-opening-soon';
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        PERFORM cron.schedule(
            'cleanup-empty-ready-sealed-capsules',
            '* * * * *',
            'SELECT public.cleanup_empty_ready_sealed_capsules();'
        );

        PERFORM cron.schedule(
            'notify-followed-capsules-opening-soon',
            '*/5 * * * *',
            'SELECT public.notify_followed_capsules_opening_soon();'
        );
    END IF;
END $$;
