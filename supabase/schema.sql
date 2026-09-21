-- 1. Create User Roles Enum
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'murabbi', 'mutarabbi');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  murabbi_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'mutarabbi',
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();


-- Add foreign key back to groups.murabbi_id -> profiles.id safely
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_murabbi' AND table_name = 'groups'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT fk_murabbi
      FOREIGN KEY (murabbi_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mutarabbi_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  marked_by UUID NOT NULL REFERENCES public.profiles(id),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_present BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_attendance_per_day UNIQUE (mutarabbi_id, session_date)
);

-- 5. Create Daily Tracker Items Table
CREATE TABLE IF NOT EXISTS public.tracker_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Daily Tracker Logs Table
CREATE TABLE IF NOT EXISTS public.tracker_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.tracker_items(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_tracker_log UNIQUE (user_id, item_id, log_date)
);

-- 7. Create Assignments Table
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Create Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  mutarabbi_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_text TEXT,
  file_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_submission_per_assignment UNIQUE (assignment_id, mutarabbi_id)
);

-- 9. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- 10. Helper Functions for Role Checking
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.user_role AS $$
DECLARE
  u_role public.user_role;
BEGIN
  IF user_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT role INTO u_role FROM public.profiles WHERE id = user_id LIMIT 1;
  RETURN u_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 11. RLS Policies

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
CREATE POLICY "Admin full access to profiles" ON public.profiles
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read profiles" ON public.profiles;
CREATE POLICY "Authenticated users read profiles" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Murabbi update mutarabbi profiles" ON public.profiles;
CREATE POLICY "Murabbi update mutarabbi profiles" ON public.profiles
  FOR UPDATE USING (
    public.get_user_role(auth.uid()) = 'murabbi' AND role = 'mutarabbi'
  );


-- GROUPS POLICIES
DROP POLICY IF EXISTS "Admin full access to groups" ON public.groups;
CREATE POLICY "Admin full access to groups" ON public.groups
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users read groups" ON public.groups;
CREATE POLICY "Authenticated users read groups" ON public.groups
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin & Murabbi insert groups" ON public.groups;
CREATE POLICY "Admin & Murabbi insert groups" ON public.groups
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'murabbi')
  );

DROP POLICY IF EXISTS "Murabbi update assigned groups" ON public.groups;
CREATE POLICY "Murabbi update assigned groups" ON public.groups
  FOR UPDATE USING (murabbi_id = auth.uid() AND public.get_user_role(auth.uid()) = 'murabbi');


-- TRIGGER TO PREVENT MUTARABBI FROM UPDATING THEIR OWN FULL_NAME
CREATE OR REPLACE FUNCTION public.check_mutarabbi_name_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.role = 'mutarabbi' AND OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
    IF (auth.uid() IS NOT NULL AND auth.uid() != OLD.id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Mutarabbi / Students are not permitted to change their registered name.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_mutarabbi_name_protection ON public.profiles;
CREATE TRIGGER enforce_mutarabbi_name_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_mutarabbi_name_change();

-- ATTENDANCE RECORDS POLICIES
DROP POLICY IF EXISTS "Admin & Murabbi manage attendance" ON public.attendance_records;
CREATE POLICY "Admin & Murabbi manage attendance" ON public.attendance_records
  FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));

DROP POLICY IF EXISTS "Mutarabbi view own attendance" ON public.attendance_records;
CREATE POLICY "Mutarabbi view own attendance" ON public.attendance_records
  FOR SELECT USING (mutarabbi_id = auth.uid());

-- TRACKER ITEMS POLICIES
DROP POLICY IF EXISTS "Everyone view tracker items" ON public.tracker_items;
CREATE POLICY "Everyone view tracker items" ON public.tracker_items
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin & Murabbi manage tracker items" ON public.tracker_items;
CREATE POLICY "Admin & Murabbi manage tracker items" ON public.tracker_items
  FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));

-- TRACKER LOGS POLICIES
DROP POLICY IF EXISTS "Users manage own tracker logs" ON public.tracker_logs;
CREATE POLICY "Users manage own tracker logs" ON public.tracker_logs
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Murabbi and Admin view tracker logs" ON public.tracker_logs;
CREATE POLICY "Murabbi and Admin view tracker logs" ON public.tracker_logs
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));

-- ASSIGNMENTS POLICIES
DROP POLICY IF EXISTS "Everyone view assignments" ON public.assignments;
CREATE POLICY "Everyone view assignments" ON public.assignments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin & Murabbi manage assignments" ON public.assignments;
CREATE POLICY "Admin & Murabbi manage assignments" ON public.assignments
  FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));

-- SUBMISSIONS POLICIES
DROP POLICY IF EXISTS "Mutarabbi manage own submissions" ON public.submissions;
CREATE POLICY "Mutarabbi manage own submissions" ON public.submissions
  FOR ALL USING (mutarabbi_id = auth.uid());

DROP POLICY IF EXISTS "Admin & Murabbi view all submissions" ON public.submissions;
CREATE POLICY "Admin & Murabbi view all submissions" ON public.submissions
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'murabbi'));

-- 12. Robust Auto-create Profile Trigger
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
