export type UserRole = "admin" | "murabbi" | "mutarabbi";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  group_id: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  murabbi_id: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  mutarabbi_id: string;
  group_id: string;
  marked_by: string;
  session_date: string;
  is_present: boolean;
  notes?: string;
}

export interface TrackerItem {
  id: string;
  title: string;
  description?: string;
  created_by: string;
  created_at: string;
}

export interface TrackerLog {
  id: string;
  user_id: string;
  item_id: string;
  log_date: string;
  is_completed: boolean;
  updated_at: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  group_id: string;
  created_by: string;
  created_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  mutarabbi_id: string;
  submission_text?: string;
  file_url?: string;
  submitted_at: string;
}
