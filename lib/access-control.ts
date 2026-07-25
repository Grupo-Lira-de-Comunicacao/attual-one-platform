export const PUBLIC = ["/loja", "/login", "/recuperar-senha", "/nova-senha", "/auth", "/api/auth/logout"];
export const MEMBERSHIP_ROUTES = ["/sem-empresa", "/selecionar-empresa", "/api/company"];

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

// Decisão pura de roteamento, isolada de I/O de rede/Supabase para permitir teste unitário direto (sem next/server nem Supabase).
export function resolveAccessDecision(input: { pathname: string; user: { id: string } | null; memberships: Array<{ company_id: string }> | null; selectedCompanyId: string | null }): AccessDecision {
  const { pathname, user, memberships, selectedCompanyId } = input;
  const isPublic = PUBLIC.some((prefix) => pathname.startsWith(prefix));
  if (!user && !isPublic) return { action: "redirect", to: `/login?retorno=${encodeURIComponent(pathname)}` };
  if (user && pathname === "/login") return { action: "redirect", to: "/" };
  if (user && !isPublic && !MEMBERSHIP_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
    if (!memberships?.length) return { action: "redirect", to: "/sem-empresa" };
    if (!selectedCompanyId || !memberships.some((row) => row.company_id === selectedCompanyId)) return { action: "redirect", to: "/selecionar-empresa" };
  }
  return { action: "allow" };
}
