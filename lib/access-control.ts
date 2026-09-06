export const PUBLIC = [
  "/site",
  "/loja",
  "/motoboy",
  "/login",
  "/recuperar-senha",
  "/nova-senha",
  "/auth",
  "/api/auth/logout",
  "/api/integrations/casting/events",
  "/api/storefront",
  "/api/delivery",
];
export const MEMBERSHIP_ROUTES = ["/sem-empresa", "/selecionar-empresa", "/api/company"];
export const PLATFORM_ADMIN_ROUTES = ["/mestre", "/api/platform"];

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

export function resolveAccessDecision(input: { pathname: string; user: { id: string } | null; memberships: Array<{ company_id: string }> | null; selectedCompanyId: string | null; isPlatformAdmin: boolean }): AccessDecision {
  const { pathname, user, memberships, selectedCompanyId, isPlatformAdmin } = input;
  const isPublic = PUBLIC.some((prefix) => pathname.startsWith(prefix));
  if (!user && !isPublic) return { action: "redirect", to: `/login?retorno=${encodeURIComponent(pathname)}` };
  if (user && pathname === "/login") return { action: "redirect", to: "/" };
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
