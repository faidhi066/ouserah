-- Migration: Rely on group_members as single source of truth for memberships, drop group_id from profiles

-- 1. Ensure all existing profile.group_id relationships are saved into group_members
INSERT INTO public.group_members (user_id, group_id, role)
SELECT id, group_id, 'mutarabbi'::public.user_role
FROM public.profiles
WHERE group_id IS NOT NULL
ON CONFLICT (user_id, group_id, role) DO NOTHING;

-- 2. Drop legacy trigger on profiles.group_id if it exists
DROP TRIGGER IF EXISTS on_profile_group_changed ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_mutarabbi_membership();

-- 3. Drop group_id column from profiles table
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS group_id CASCADE;

-- 4. Update handle_new_user trigger to insert group_members if group_id is in metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_role_text TEXT;
  parsed_roles public.user_role[] := '{mutarabbi}'::public.user_role[];
  raw_group_id UUID := NULL;
  raw_created_at TIMESTAMPTZ := NOW();
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    raw_role_text := NEW.raw_user_meta_data->>'role';
    IF raw_role_text IN ('admin', 'murabbi', 'mutarabbi') THEN
      parsed_roles := ARRAY[raw_role_text::public.user_role];
    END IF;

    IF NEW.raw_user_meta_data->>'group_id' IS NOT NULL AND NEW.raw_user_meta_data->>'group_id' != '' THEN
      raw_group_id := (NEW.raw_user_meta_data->>'group_id')::UUID;
    END IF;

    IF NEW.raw_user_meta_data->>'created_at' IS NOT NULL AND NEW.raw_user_meta_data->>'created_at' != '' THEN
      raw_created_at := (NEW.raw_user_meta_data->>'created_at')::TIMESTAMPTZ;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, roles, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
    parsed_roles,
    raw_created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    roles = COALESCE(EXCLUDED.roles, public.profiles.roles),
    created_at = COALESCE(EXCLUDED.created_at, public.profiles.created_at),
    updated_at = NOW();

  IF raw_group_id IS NOT NULL THEN
    INSERT INTO public.group_members (user_id, group_id, role)
    VALUES (NEW.id, raw_group_id, 'mutarabbi'::public.user_role)
    ON CONFLICT (user_id, group_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
