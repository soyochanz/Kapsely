-- FIX PARA RECURSIÓN INFINITA EN POLÍTICAS DE RLS
-- Creamos una función SECURITY DEFINER para comprobar membresía sin disparar RLS recursivo.

CREATE OR REPLACE FUNCTION public.is_capsule_member(p_capsule_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        -- Es el dueño
        SELECT 1 FROM public.capsules 
        WHERE id = p_capsule_id AND owner_id = p_user_id
        UNION
        -- Es un miembro aceptado
        SELECT 1 FROM public.capsule_invites 
        WHERE capsule_id = p_capsule_id AND user_id = p_user_id AND status = 'accepted'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizamos la política de inserción para usar la función
DROP POLICY IF EXISTS "Cualquier miembro puede invitar" ON public.capsule_invites;
CREATE POLICY "Cualquier miembro puede invitar" 
ON public.capsule_invites FOR INSERT 
WITH CHECK (
    is_capsule_member(capsule_id, auth.uid())
);

-- También necesitamos una política de SELECT para que los miembros vean las invitaciones
DROP POLICY IF EXISTS "Miembros pueden ver invitaciones" ON public.capsule_invites;
CREATE POLICY "Miembros pueden ver invitaciones"
ON public.capsule_invites FOR SELECT
USING (
    is_capsule_member(capsule_id, auth.uid())
);
