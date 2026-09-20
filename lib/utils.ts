/**
 * Returns initials for a user's full name.
 * If the name has 1 word (e.g. "Faidhi"), returns 1 letter ("F").
 * If the name has multiple words (e.g. "Faidhi Hakim"), returns first letter of first and last word ("FH").
 */
export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
