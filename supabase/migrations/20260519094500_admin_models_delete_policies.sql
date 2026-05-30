-- Allow admin management of capsule models and timer configs from Calibration Tool.

DROP POLICY IF EXISTS "admins_manage_models" ON public.models;
CREATE POLICY "admins_manage_models"
ON public.models
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
    )
);

DROP POLICY IF EXISTS "admins_manage_model_configs" ON public.model_configs;
CREATE POLICY "admins_manage_model_configs"
ON public.model_configs
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_configs TO authenticated;
