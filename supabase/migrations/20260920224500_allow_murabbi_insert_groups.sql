-- Migration: Allow Admin & Murabbi to insert new Usrah groups
DROP POLICY IF EXISTS "Admin & Murabbi insert groups" ON public.groups;
CREATE POLICY "Admin & Murabbi insert groups" ON public.groups
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'murabbi')
  );
