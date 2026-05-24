/**
 * Resolve the current authenticated user's full profile context — the data
 * shape that goes into every CRM JWT plus the `is_super_admin` flag and
 * department × role list.
 *
 * Used by:
 *   - /api/sso/issue            (mint JWT)
 *   - (dashboard)/page.tsx      (decide which Quick Launch tiles to render)
 *
 * Returns null if not signed in. Throws on database errors so the caller
 * can decide whether to 500 or redirect.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DepartmentClaim } from "./jwt-sign";

export interface UserContext {
  userId: string;
  email: string;
  displayName: string | null;
  isSuperAdmin: boolean;
  departments: DepartmentClaim[];
}

export async function getCurrentUserContext(): Promise<UserContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return null;
  }

  // One query, two reads — profile flag + department assignments. The RLS
  // policies on these tables grant the user read access to their own rows,
  // so the anon-key client works here (no service role needed).
  const [profileRes, deptsRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("display_name, is_super_admin")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_departments")
      .select("department_id, role")
      .eq("user_id", user.id),
  ]);

  if (profileRes.error) {
    throw new Error(`[user-context] profile fetch failed: ${profileRes.error.message}`);
  }
  if (deptsRes.error) {
    throw new Error(`[user-context] departments fetch failed: ${deptsRes.error.message}`);
  }

  const departments: DepartmentClaim[] = (deptsRes.data ?? []).map((row) => ({
    department: row.department_id,
    role: row.role as DepartmentClaim["role"],
  }));

  return {
    userId: user.id,
    email: user.email,
    displayName: profileRes.data?.display_name ?? null,
    isSuperAdmin: profileRes.data?.is_super_admin === true,
    departments,
  };
}
