-- Allow admins to resolve moderation decisions directly on capsule items.

DROP POLICY IF EXISTS "Admins can update capsule item moderation" ON public.capsule_items;
CREATE POLICY "Admins can update capsule item moderation"
ON public.capsule_items
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = TRUE
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = TRUE
    )
);

GRANT UPDATE (
    moderation_status,
    moderation_reason,
    moderation_review_id,
    moderated_at
) ON public.capsule_items TO authenticated;
