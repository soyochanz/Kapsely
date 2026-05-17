-- AI content moderation for capsule uploads.
-- Uploads are reviewed before insertion; approved rows keep an audit trail.

ALTER TABLE public.capsule_items
    ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
    ADD COLUMN IF NOT EXISTS moderation_review_id UUID,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'capsule_items_moderation_status_check'
          AND conrelid = 'public.capsule_items'::regclass
    ) THEN
        ALTER TABLE public.capsule_items
            ADD CONSTRAINT capsule_items_moderation_status_check
            CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'needs_review', 'error'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.content_moderation_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.capsule_items(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    capsule_id UUID REFERENCES public.capsules(id) ON DELETE SET NULL,
    media_type TEXT,
    media_url TEXT,
    content_excerpt TEXT,
    status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('approved', 'rejected', 'needs_review', 'error')),
    action TEXT NOT NULL DEFAULT 'allow'
        CHECK (action IN ('allow', 'block', 'review')),
    reason TEXT,
    model TEXT,
    categories JSONB NOT NULL DEFAULT '{}'::jsonb,
    category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'capsule_items_moderation_review_id_fkey'
          AND conrelid = 'public.capsule_items'::regclass
    ) THEN
        ALTER TABLE public.capsule_items
            ADD CONSTRAINT capsule_items_moderation_review_id_fkey
            FOREIGN KEY (moderation_review_id)
            REFERENCES public.content_moderation_reviews(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'capsule_items_moderation_review_id_fkey'
          AND conrelid = 'public.capsule_items'::regclass
          AND convalidated = FALSE
    ) THEN
        ALTER TABLE public.capsule_items VALIDATE CONSTRAINT capsule_items_moderation_review_id_fkey;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_capsule_items_moderation_status
    ON public.capsule_items(moderation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_moderation_reviews_owner_created
    ON public.content_moderation_reviews(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_moderation_reviews_status_created
    ON public.content_moderation_reviews(status, created_at DESC);

ALTER TABLE public.content_moderation_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own moderation reviews" ON public.content_moderation_reviews;
CREATE POLICY "Users can read own moderation reviews"
ON public.content_moderation_reviews
FOR SELECT
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can read moderation reviews" ON public.content_moderation_reviews;
CREATE POLICY "Admins can read moderation reviews"
ON public.content_moderation_reviews
FOR SELECT
USING (EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
));

DROP POLICY IF EXISTS "Service can insert moderation reviews" ON public.content_moderation_reviews;
CREATE POLICY "Service can insert moderation reviews"
ON public.content_moderation_reviews
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.content_moderation_reviews TO authenticated;
