export const PUBLIC = [
  "/loja",
  "/login",
  "/recuperar-senha",
  "/nova-senha",
  "/auth",
  "/api/auth/logout",
  "/api/integrations/casting/events",
  "/api/storefront",
];
export const MEMBERSHIP_ROUTES = ["/sem-empresa", "/selecionar-empresa", "/api/company"];
export const PLATFORM_ADMIN_ROUTES = ["/mestre"];

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

// Decisão pura de roteamento, isolada de I/O de rede/Supabase para permitir teste unitário direto (sem next/server nem Supabase).
export function resolveAccessDecision(input: { pathname: string; user: { id: string } | null; memberships: Array<{ company_id: string }> | null; selectedCompanyId: string | null; isPlatformAdmin: boolean }): AccessDecision {
  const { pathname, user, memberships, selectedCompanyId, isPlatformAdmin } = input;
  const isPublic = PUBLIC.some((prefix) => pathname.startsWith(prefix));
  if (!user && !isPublic) return { action: "redirect", to: `/login?retorno=${encodeURIComponent(pathname)}` };
  if (user && pathname === "/login") return { action: "redirect", to: "/" };
  // /mestre é global e fica fora do fluxo de empresa selecionada: nem exige vínculo em
  // company_users, nem é liberado por ele — só platform admin acessa, isolado do painel normal.
  if (PLATFORM_ADMIN_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
    if (!isPlatformAdmin) return { action: "redirect", to: "/" };
    return { action: "allow" };
  }
  if (user && !isPublic && !MEMBERSHIP_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
    if (!memberships?.length) return { action: "redirect", to: "/sem-empresa" };
    if (!selectedCompanyId || !memberships.some((row) => row.company_id === selectedCompanyId)) return { action: "redirect", to: "/selecionar-empresa" };
  }
  return { action: "allow" };
}
