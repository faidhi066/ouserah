-- Migration: Support multiple roles array in profiles for dual role users (Murabbi + Mutarabbi)

-- 1. Add roles array column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles public.user_role[] DEFAULT '{mutarabbi}'::public.user_role[];

-- 2. Populate roles array from existing single role column
UPDATE public.profiles
SET roles = ARRAY[role]
WHERE roles IS NULL OR array_length(roles, 1) IS NULL;

-- 3. Helper function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_user_role(user_id UUID, target_role public.user_role)
RETURNS BOOLEAN AS $$
DECLARE
  u_roles public.user_role[];
  u_role public.user_role;
BEGIN
  IF user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT roles, role INTO u_roles, u_role FROM public.profiles WHERE id = user_id LIMIT 1;

  IF u_roles IS NOT NULL AND target_role = ANY(u_roles) THEN
    RETURN TRUE;
  END IF;

  RETURN u_role = target_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4. Update get_user_role function to maintain backwards compatibility
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.user_role AS $$
DECLARE
  u_role public.user_role;
  u_roles public.user_role[];
BEGIN
  IF user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role, roles INTO u_role, u_roles FROM public.profiles WHERE id = user_id LIMIT 1;

  IF 'admin'::public.user_role = ANY(u_roles) OR u_role = 'admin' THEN
    RETURN 'admin'::public.user_role;
  ELSIF 'murabbi'::public.user_role = ANY(u_roles) OR u_role = 'murabbi' THEN
    RETURN 'murabbi'::public.user_role;
  END IF;

  RETURN COALESCE(u_role, 'mutarabbi'::public.user_role);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 5. Update handle_new_user trigger to populate roles array on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_role_text TEXT;
  parsed_role public.user_role := 'mutarabbi'::public.user_role;
  parsed_roles public.user_role[] := '{mutarabbi}'::public.user_role[];
  raw_group_id UUID := NULL;
  raw_created_at TIMESTAMPTZ := NOW();
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    raw_role_text := NEW.raw_user_meta_data->>'role';
    IF raw_role_text IN ('admin', 'murabbi', 'mutarabbi') THEN
      parsed_role := raw_role_text::public.user_role;
      parsed_roles := ARRAY[parsed_role];
    END IF;

    IF NEW.raw_user_meta_data->>'group_id' IS NOT NULL AND NEW.raw_user_meta_data->>'group_id' != '' THEN
      raw_group_id := (NEW.raw_user_meta_data->>'group_id')::UUID;
    END IF;

    IF NEW.raw_user_meta_data->>'created_at' IS NOT NULL AND NEW.raw_user_meta_data->>'created_at' != '' THEN
      raw_created_at := (NEW.raw_user_meta_data->>'created_at')::TIMESTAMPTZ;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, roles, group_id, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
    parsed_role,
    parsed_roles,
    raw_group_id,
    raw_created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    roles = COALESCE(EXCLUDED.roles, public.profiles.roles),
    group_id = COALESCE(EXCLUDED.group_id, public.profiles.group_id),
    created_at = COALESCE(EXCLUDED.created_at, public.profiles.created_at),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
