ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS parent_comment_id uuid NULL REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id
ON public.comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_comments_capsule_parent_created_at
ON public.comments(capsule_id, parent_comment_id, created_at DESC);
