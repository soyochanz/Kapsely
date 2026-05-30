-- Per-member capsule covers for accepted collaborators.

ALTER TABLE public.capsule_invites
    ADD COLUMN IF NOT EXISTS cover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_capsule_invites_user_capsule_cover
    ON public.capsule_invites(user_id, capsule_id)
    WHERE status = 'accepted';
