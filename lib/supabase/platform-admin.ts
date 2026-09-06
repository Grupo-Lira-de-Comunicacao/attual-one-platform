import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformCompanySummary { id: string; name: string; slug: string; deletedAt: string | null; createdAt: string; memberCount: number }
export interface PlatformUserLookup { userId: string; fullName: string | null }

export async function listCompaniesForPlatformAdmin(supabase: SupabaseClient): Promise<PlatformCompanySummary[]> {
  const [{ data: companies, error: companiesError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from("companies").select("id,name,slug,deleted_at,created_at").order("created_at", { ascending: false }),
    supabase.from("company_users").select("company_id").eq("status", "active"),
  ]);
  if (companiesError) throw new Error(companiesError.message);
  if (membershipsError) throw new Error(membershipsError.message);
  const counts = new Map<string, number>();
  for (const row of memberships ?? []) counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
  return (companies ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, deletedAt: c.deleted_at, createdAt: c.created_at, memberCount: counts.get(c.id) ?? 0 }));
}

export async function findUserByEmailForPlatformAdmin(supabase: SupabaseClient, email: string): Promise<PlatformUserLookup | null> {
  const { data, error } = await supabase.rpc("platform_find_user_by_email", { p_email: email });
  if (error) throw new Error(error.message);
  const row = (data as Array<{ user_id: string; full_name: string | null }> | null)?.[0];
  return row ? { userId: row.user_id, fullName: row.full_name } : null;
}

export async function inviteOwnerForPlatformAdmin(email: string): Promise<PlatformUserLookup> {
  const response = await fetch("/api/platform/invite-owner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json() as { userId?: string; error?: string };
  if (!response.ok || !payload.userId) throw new Error(payload.error || "Não foi possível convidar o proprietário.");
  return { userId: payload.userId, fullName: null };
}

export async function createCompanyForPlatformAdmin(supabase: SupabaseClient, input: { name: string; slug: string; ownerUserId: string }): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("platform_create_company", { p_name: input.name, p_slug: input.slug, p_owner_user_id: input.ownerUserId });
  if (error) return { error: error.message };
  return {};
}

export async function linkOwnerForPlatformAdmin(supabase: SupabaseClient, input: { companyId: string; userId: string }): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("platform_link_owner", { p_company_id: input.companyId, p_user_id: input.userId });
  if (error) return { error: error.message };
  return {};
}
