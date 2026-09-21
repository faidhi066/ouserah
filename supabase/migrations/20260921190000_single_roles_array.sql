-- Migration: Streamline roles into a single roles array column (drop legacy single role column with dependencies)

-- 1. Add roles column if missing and populate from existing role column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles public.user_role[] DEFAULT '{mutarabbi}'::public.user_role[];

UPDATE public.profiles
SET roles = ARRAY[role]
WHERE (roles IS NULL OR array_length(roles, 1) IS NULL OR array_length(roles, 1) = 0)
  AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role'
  );

ALTER TABLE public.profiles
  ALTER COLUMN roles SET DEFAULT '{mutarabbi}'::public.user_role[],
  ALTER COLUMN roles SET NOT NULL;

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.has_user_role(user_id UUID, target_role public.user_role)
RETURNS BOOLEAN AS $$
DECLARE
  u_roles public.user_role[];
BEGIN
  IF user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT roles INTO u_roles FROM public.profiles WHERE id = user_id LIMIT 1;

  IF u_roles IS NOT NULL AND target_role = ANY(u_roles) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.user_role AS $$
DECLARE
  u_roles public.user_role[];
BEGIN
  IF user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT roles INTO u_roles FROM public.profiles WHERE id = user_id LIMIT 1;

  IF 'admin'::public.user_role = ANY(u_roles) THEN
    RETURN 'admin'::public.user_role;
  ELSIF 'murabbi'::public.user_role = ANY(u_roles) THEN
    RETURN 'murabbi'::public.user_role;
  END IF;

  RETURN 'mutarabbi'::public.user_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Update dependent RLS policies and trigger functions BEFORE dropping role column
DROP POLICY IF EXISTS "Murabbi update mutarabbi profiles" ON public.profiles;
CREATE POLICY "Murabbi update mutarabbi profiles" ON public.profiles
  FOR UPDATE USING (
    public.has_user_role(auth.uid(), 'murabbi') AND 'mutarabbi'::public.user_role = ANY(roles)
  );

CREATE OR REPLACE FUNCTION public.check_mutarabbi_name_change()
RETURNS TRIGGER AS $$
BEGIN
  IF ('mutarabbi'::public.user_role = ANY(OLD.roles) AND OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
    IF (auth.uid() IS NOT NULL AND auth.uid() != OLD.id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Mutarabbi / Students are not permitted to change their registered name.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Drop legacy single 'role' column
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS role CASCADE;

-- 5. Update handle_new_user trigger
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

  INSERT INTO public.profiles (id, full_name, roles, group_id, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
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
