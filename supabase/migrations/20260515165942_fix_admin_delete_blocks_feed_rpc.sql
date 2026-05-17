-- Fix admin library deletes, missing block table, and ambiguous feed impression RPC.

CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON public.blocks;
CREATE POLICY "blocks_select_own"
ON public.blocks
FOR SELECT
USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON public.blocks;
CREATE POLICY "blocks_insert_own"
ON public.blocks
FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON public.blocks;
CREATE POLICY "blocks_delete_own"
ON public.blocks
FOR DELETE
USING (auth.uid() = blocker_id);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;

DROP POLICY IF EXISTS "admins_manage_stickers" ON public.stickers;
CREATE POLICY "admins_manage_stickers"
ON public.stickers
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "admins_manage_chains" ON public.chains;
CREATE POLICY "admins_manage_chains"
ON public.chains
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "admins_manage_model_chain_configs" ON public.model_chain_configs;
CREATE POLICY "admins_manage_model_chain_configs"
ON public.model_chain_configs
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "admins_delete_profile_stickers" ON public.profile_stickers;
CREATE POLICY "admins_delete_profile_stickers"
ON public.profile_stickers
FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "admins_delete_user_stickers" ON public.user_stickers;
CREATE POLICY "admins_delete_user_stickers"
ON public.user_stickers
FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stickers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chains TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_chain_configs TO authenticated;
GRANT SELECT, DELETE ON public.profile_stickers TO authenticated;
GRANT SELECT, DELETE ON public.user_stickers TO authenticated;

DROP FUNCTION IF EXISTS public.record_feed_impressions(UUID, UUID[]);
