-- Migration: Add group_id to tracker_items for group-unique Mutabaah tracking

ALTER TABLE public.tracker_items
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;

-- Update RLS policies for tracker_items
DROP POLICY IF EXISTS "Everyone view tracker items" ON public.tracker_items;
CREATE POLICY "Everyone view tracker items" ON public.tracker_items
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin & Murabbi manage tracker items" ON public.tracker_items;
CREATE POLICY "Admin & Murabbi manage tracker items" ON public.tracker_items
  FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));
