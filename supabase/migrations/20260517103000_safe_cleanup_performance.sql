-- Safe cleanup from the database audit.
-- This migration only removes duplicate/obsolete objects that the current app no longer uses.

-- Move any remaining story_views records into story_reads before removing the duplicate table.
DO $$
BEGIN
    IF to_regclass('public.story_views') IS NOT NULL
       AND to_regclass('public.story_reads') IS NOT NULL THEN
        EXECUTE $migrate$
            INSERT INTO public.story_reads (user_id, story_id)
            SELECT user_id, story_id
            FROM public.story_views
            ON CONFLICT (user_id, story_id) DO NOTHING
        $migrate$;
    END IF;
END $$;

DROP TABLE IF EXISTS public.story_views CASCADE;

-- Keep story_reads fast enough for read-state checks and owner viewer counts.
DO $$
BEGIN
    IF to_regclass('public.story_reads') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_story_reads_story_id ON public.story_reads(story_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_story_reads_user_id ON public.story_reads(user_id)';
    END IF;
END $$;

-- The capsule-created notification trigger was replaced by capsule-item notifications.
DROP TRIGGER IF EXISTS on_capsule_created ON public.capsules;
DROP TRIGGER IF EXISTS on_capsule_created_notify_followers ON public.capsules;
DROP FUNCTION IF EXISTS public.handle_new_capsule_notification();

-- Remove old RPC overloads so Supabase only resolves the current app signatures.
DROP FUNCTION IF EXISTS public.get_combined_feed_data(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_combined_feed_data(TEXT, TEXT, INTEGER, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS public.get_combined_feed_data(UUID, TEXT, TEXT, INTEGER, INTEGER);

DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, UUID[], TEXT[]);
DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, TEXT[], UUID[]);

-- Protect collaborative deletion votes without changing the vote_delete_capsule RPC flow.
DO $$
BEGIN
    IF to_regclass('public.capsule_delete_votes') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.capsule_delete_votes ENABLE ROW LEVEL SECURITY';

        EXECUTE 'DROP POLICY IF EXISTS capsule_delete_votes_select_own_or_owner ON public.capsule_delete_votes';
        EXECUTE 'DROP POLICY IF EXISTS capsule_delete_votes_insert_own ON public.capsule_delete_votes';

        EXECUTE $policy$
            CREATE POLICY capsule_delete_votes_select_own_or_owner
            ON public.capsule_delete_votes
            FOR SELECT
            USING (
                auth.uid() = user_id
                OR EXISTS (
                    SELECT 1
                    FROM public.capsules c
                    WHERE c.id = capsule_id
                      AND c.owner_id = auth.uid()
                )
            )
        $policy$;

        EXECUTE $policy$
            CREATE POLICY capsule_delete_votes_insert_own
            ON public.capsule_delete_votes
            FOR INSERT
            WITH CHECK (auth.uid() = user_id)
        $policy$;
    END IF;
END $$;
