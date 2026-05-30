-- Allow archiving models that still have historical references and keep resolved moderation records searchable.

ALTER TABLE public.models
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_models_visible_active
    ON public.models(is_hidden, is_active, created_at DESC);
