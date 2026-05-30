-- Emergency rollback for the feed/profile loading regression.
-- story_reads sits inside hot feed/profile RPCs; enabling RLS here can make those RPCs stall.

DO $$
BEGIN
    IF to_regclass('public.story_reads') IS NOT NULL THEN
        ALTER TABLE public.story_reads DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS story_reads_select_own_or_story_owner ON public.story_reads;
        DROP POLICY IF EXISTS story_reads_insert_own ON public.story_reads;
        DROP POLICY IF EXISTS story_reads_update_own ON public.story_reads;
        DROP POLICY IF EXISTS story_reads_delete_own ON public.story_reads;
    END IF;
END $$;
