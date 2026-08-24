-- Hot paths used when opening Notifications and Capsule Detail.
-- The unread index cannot efficiently provide a global created_at ordering
-- when both read states are requested, so keep a dedicated list index.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at_hot
    ON public.notifications(user_id, created_at DESC);

-- Supports accepted/pending membership checks and detail invite hydration.
CREATE INDEX IF NOT EXISTS idx_capsule_invites_capsule_status_user_hot
    ON public.capsule_invites(capsule_id, status, user_id);

-- Supports the capsule detail media query while rejecting moderated rows.
CREATE INDEX IF NOT EXISTS idx_capsule_items_capsule_created_visible_hot
    ON public.capsule_items(capsule_id, created_at)
    WHERE moderation_status IS DISTINCT FROM 'rejected';
