# Ouserah Mobile App (Supabase + Expo + TypeScript)

**Ouserah** (_us_ (we) + _serah_ (give in)) is a mobile application built to cater for student management, daily activity tracking (_mutabaah_), weekly attendance marking, and assignment submissions across three authorization tiers: **Admin**, **Murabbi**, and **Mutarabbi (Student)**.

---

## 🔐 Authorization Role Matrix

| Action / Capability                          |      Admin      |       Murabbi        |          Mutarabbi (Student)           |
| :------------------------------------------- | :-------------: | :------------------: | :------------------------------------: |
| **Manage / Edit All System Profiles**        |       ✅        |          ❌          |                   ❌                   |
| **Manage Multiple Usrah Groups**             |       ✅        | ✅ (Assigned groups) |                   ❌                   |
| **Key In / Edit Weekly Attendance**          |       ✅        |          ✅          |       ❌ (Read-only own history)       |
| **Create Daily Tracker Items**               |       ✅        |          ✅          |                   ❌                   |
| **Mark Daily Tracker Items (Done / Undone)** |       ✅        |          ✅          |             ✅ (Own logs)              |
| **Create & View Homework Assignments**       |       ✅        |          ✅          |        ✅ (View & Submit work)         |
| **Update Own Profile Info**                  | ✅ (All fields) |   ✅ (All fields)    | ⚠️ (All fields except registered name) |

---

## 🗄 Database Schema Reference

### 1. User Roles Enum (`public.user_role`)

```sql
CREATE TYPE public.user_role AS ENUM ('admin', 'murabbi', 'mutarabbi');
```

### 2. Groups Table (`public.groups`)

Stores Usrah groups. Multiple groups can reference the same `murabbi_id` (1 Murabbi can manage multiple Usrah groups).

```sql
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  murabbi_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Profiles Table (`public.profiles`)

Extends Supabase `auth.users(id)` with user metadata and role authorization.

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'mutarabbi',
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Attendance Records Table (`public.attendance_records`)

Stores weekly session attendance marked by Murabbi or Admin.

```sql
CREATE TABLE public.attendance_records (
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
```

### 5. Daily Tracker Items Table (`public.tracker_items`)

Master list of daily activity tracker templates (_mutabaah_).

```sql
CREATE TABLE public.tracker_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. Daily Tracker Logs Table (`public.tracker_logs`)

Per-user completion logs for daily tracker items.

```sql
CREATE TABLE public.tracker_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.tracker_items(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_tracker_log UNIQUE (user_id, item_id, log_date)
);
```

### 7. Assignments Table (`public.assignments`)

Homework assignments created by Murabbi or Admin.

```sql
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8. Submissions Table (`public.submissions`)

Student assignment answers and submitted file links.

```sql
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  mutarabbi_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_text TEXT,
  file_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_submission_per_assignment UNIQUE (assignment_id, mutarabbi_id)
);
```

---

## ⚡ Triggers & Helper Functions

### Auto-Profile Creation Trigger

Executed after `auth.users` insert to automatically populate `public.profiles`. Uses `SET search_path = public` and exception trapping to prevent Auth transaction failures.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_role_text TEXT;
  parsed_role public.user_role := 'mutarabbi'::public.user_role;
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    raw_role_text := NEW.raw_user_meta_data->>'role';
    IF raw_role_text IN ('admin', 'murabbi', 'mutarabbi') THEN
      parsed_role := raw_role_text::public.user_role;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
    parsed_role,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

### Mutarabbi Name Protection Trigger

Prevents `mutarabbi` users from changing their registered name via API/client calls while allowing admins to perform name updates.

```sql
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
```

---

## 🛠 Migration History (`supabase/migrations/`)

| Migration File                           | Purpose                                                                                     |
| :--------------------------------------- | :------------------------------------------------------------------------------------------ |
| `20260919000000_init_usserah_schema.sql` | Base SQL migration creating tables, types, triggers, and Row Level Security (RLS) policies. |
| `20260919233700_fix_auth_schema.sql`     | Adds explicit `search_path = public` security scoping for PL/pgSQL functions.               |
| `20260919234000_fix_500_auth_token.sql`  | Resolves recursive table query deadlocks on `/auth/v1/token` password authentication.       |
| `20260920000000_multi_usrah_murabbi.sql` | Adds multi-usrah support per Murabbi and group security policies.                           |

---

## 🚀 How to Apply Migrations to Live Supabase

Run the following command in your project directory:

```bash
npx supabase db push
```

Alternatively, copy the complete SQL schema from [`supabase/schema.sql`](./supabase/schema.sql) and execute it directly in **Supabase Dashboard > SQL Editor**.
