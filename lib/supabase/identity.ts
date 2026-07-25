import type { CompanyMembership } from "./session";

export interface Identity { userName: string; companyName: string; role: string }

export const ROLE_LABELS: Record<string, string> = { owner: "Proprietário(a)", manager: "Gerente", attendant: "Atendente", operator: "Operador(a)" };

export function roleLabel(role: string): string { return role ? (ROLE_LABELS[role] ?? role) : ""; }

// Casa a empresa selecionada (cookie já validado pelo proxy) com o vínculo real do usuário em company_users.
// Nunca cai para outra empresa do mesmo usuário: se não houver correspondência exata, usa o fallback neutro.
export function resolveIdentity(input: { user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null; memberships: CompanyMembership[]; selectedCompanyId: string | null }): Identity {
  const { user, memberships, selectedCompanyId } = input;
  const fullName = typeof user?.user_metadata?.full_name === "string" ? (user.user_metadata.full_name as string) : undefined;
  const userName = fullName || user?.email || "Usuário";
  const membership = selectedCompanyId ? memberships.find((m) => m.companyId === selectedCompanyId) ?? null : null;
  const companyName = membership?.companyName || "Empresa";
  const role = membership?.role ?? "";
  return { userName, companyName, role };
}
