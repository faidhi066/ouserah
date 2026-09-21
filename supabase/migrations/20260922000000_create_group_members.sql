-- Migration: Create group_members table to explicitly map user-to-group relationships per role

-- 1. Create group_members table
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_group_role UNIQUE (user_id, group_id, role)
);

-- Enable RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies for group_members
DROP POLICY IF EXISTS "Authenticated users view group_members" ON public.group_members;
CREATE POLICY "Authenticated users view group_members" ON public.group_members
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin & Murabbi manage group_members" ON public.group_members;
CREATE POLICY "Admin & Murabbi manage group_members" ON public.group_members
  FOR ALL USING (public.has_user_role(auth.uid(), 'admin') OR public.has_user_role(auth.uid(), 'murabbi'));

-- 3. Populate group_members table from existing groups and profiles
-- Insert Murabbi memberships from groups table
INSERT INTO public.group_members (user_id, group_id, role)
SELECT murabbi_id, id, 'murabbi'::public.user_role
FROM public.groups
WHERE murabbi_id IS NOT NULL
ON CONFLICT (user_id, group_id, role) DO NOTHING;

-- Insert Mutarabbi memberships from profiles table
INSERT INTO public.group_members (user_id, group_id, role)
SELECT id, group_id, 'mutarabbi'::public.user_role
FROM public.profiles
WHERE group_id IS NOT NULL
ON CONFLICT (user_id, group_id, role) DO NOTHING;

-- 4. Triggers to keep group_members automatically synced
-- Trigger when a group is created or murabbi_id is updated
CREATE OR REPLACE FUNCTION public.sync_group_murabbi_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.murabbi_id IS NOT NULL THEN
    INSERT INTO public.group_members (user_id, group_id, role)
    VALUES (NEW.murabbi_id, NEW.id, 'murabbi'::public.user_role)
    ON CONFLICT (user_id, group_id, role) DO NOTHING;

    -- Ensure 'murabbi' is in user's roles array
    UPDATE public.profiles
    SET roles = array_append(roles, 'murabbi'::public.user_role)
    WHERE id = NEW.murabbi_id AND NOT ('murabbi'::public.user_role = ANY(roles));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_group_murabbi_changed ON public.groups;
CREATE TRIGGER on_group_murabbi_changed
  AFTER INSERT OR UPDATE OF murabbi_id ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_murabbi_membership();

-- Trigger when a profile's group_id (Mutarabbi group) is updated
CREATE OR REPLACE FUNCTION public.sync_profile_mutarabbi_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.group_id IS NOT NULL AND (OLD.group_id IS NULL OR OLD.group_id != NEW.group_id) THEN
    -- Remove old mutarabbi group membership if changed
    IF OLD.group_id IS NOT NULL THEN
      DELETE FROM public.group_members
      WHERE user_id = NEW.id AND group_id = OLD.group_id AND role = 'mutarabbi'::public.user_role;
    END IF;

    -- Add new mutarabbi group membership
    INSERT INTO public.group_members (user_id, group_id, role)
    VALUES (NEW.id, NEW.group_id, 'mutarabbi'::public.user_role)
    ON CONFLICT (user_id, group_id, role) DO NOTHING;

    -- Ensure 'mutarabbi' is in user's roles array
    UPDATE public.profiles
    SET roles = array_append(roles, 'mutarabbi'::public.user_role)
    WHERE id = NEW.id AND NOT ('mutarabbi'::public.user_role = ANY(roles));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_group_changed ON public.profiles;
CREATE TRIGGER on_profile_group_changed
  AFTER INSERT OR UPDATE OF group_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_mutarabbi_membership();
