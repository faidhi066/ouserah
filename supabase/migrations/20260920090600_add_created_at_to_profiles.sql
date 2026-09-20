-- Migration: Add created_at column, Murabbi update policy, and auto group_id assignment in handle_new_user

-- 1. Add created_at column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Add RLS policy allowing Murabbi to update Mutarabbi profiles
DROP POLICY IF EXISTS "Murabbi update mutarabbi profiles" ON public.profiles;
CREATE POLICY "Murabbi update mutarabbi profiles" ON public.profiles
  FOR UPDATE USING (
    public.get_user_role(auth.uid()) = 'murabbi' AND role = 'mutarabbi'
  );

-- 3. Enhance handle_new_user() function to auto-assign group_id and created_at from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_role_text TEXT;
  parsed_role public.user_role := 'mutarabbi'::public.user_role;
  raw_group_id UUID := NULL;
  raw_created_at TIMESTAMPTZ := NOW();
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    raw_role_text := NEW.raw_user_meta_data->>'role';
    IF raw_role_text IN ('admin', 'murabbi', 'mutarabbi') THEN
      parsed_role := raw_role_text::public.user_role;
    END IF;

    IF NEW.raw_user_meta_data->>'group_id' IS NOT NULL AND NEW.raw_user_meta_data->>'group_id' != '' THEN
      raw_group_id := (NEW.raw_user_meta_data->>'group_id')::UUID;
    END IF;

    IF NEW.raw_user_meta_data->>'created_at' IS NOT NULL AND NEW.raw_user_meta_data->>'created_at' != '' THEN
      raw_created_at := (NEW.raw_user_meta_data->>'created_at')::TIMESTAMPTZ;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, group_id, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
    parsed_role,
    raw_group_id,
    raw_created_at,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    group_id = COALESCE(EXCLUDED.group_id, public.profiles.group_id),
    created_at = COALESCE(EXCLUDED.created_at, public.profiles.created_at),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
