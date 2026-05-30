DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_due_account_deletions') THEN
            PERFORM cron.unschedule('process_due_account_deletions');
        END IF;

        PERFORM cron.schedule(
            'process_due_account_deletions',
            '17 * * * *',
            'SELECT public.process_due_account_deletions();'
        );
    END IF;
END $$;
