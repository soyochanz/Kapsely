-- Admin moderation review workflow for the web control panel.

ALTER TABLE public.content_moderation_reviews
    ADD COLUMN IF NOT EXISTS admin_notes TEXT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Admins can update moderation reviews" ON public.content_moderation_reviews;
CREATE POLICY "Admins can update moderation reviews"
ON public.content_moderation_reviews
FOR UPDATE
USING (EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
))
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
));

GRANT UPDATE (
    status,
    action,
    reason,
    admin_notes,
    resolved_at,
    resolved_by
) ON public.content_moderation_reviews TO authenticated;

CREATE INDEX IF NOT EXISTS idx_content_moderation_reviews_resolved
    ON public.content_moderation_reviews(status, resolved_at DESC NULLS FIRST, created_at DESC);
