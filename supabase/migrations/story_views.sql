-- Create story_views table to track who has viewed each flash/story
-- Note: "stories" in Kapsely are capsule_items rows where is_story = true
CREATE TABLE IF NOT EXISTS public.story_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.capsule_items(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(story_id, user_id)
);

-- Index for fast lookups per story
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON public.story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_user_id ON public.story_views(user_id);

-- Enable RLS
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Policy: users can insert their own views
CREATE POLICY "users can insert own views"
    ON public.story_views
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: story owner can see who viewed their story; viewers can see own record
-- owner_id is on capsule_items (stories are capsule_items with is_story = true)
CREATE POLICY "story owner can see viewers"
    ON public.story_views
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        auth.uid() IN (
            SELECT owner_id FROM public.capsule_items WHERE id = story_id
        )
    );

-- Policy: allow upsert (update if conflict)
CREATE POLICY "users can update own views"
    ON public.story_views
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

