export type CompanySelectionResult = { ok: true } | { ok: false; status: number; error: string };

// Decisão pura de autorização de troca de empresa, isolada de I/O para permitir teste unitário direto.
// "Empresa inexistente" e "empresa sem vínculo ativo" resultam no mesmo membership=null de propósito:
// a API não deve revelar se uma empresa existe para quem não tem vínculo com ela.
export function resolveCompanySelection(input: { companyId?: string; user: { id: string } | null; membership: { company_id: string } | null }): CompanySelectionResult {
  if (!input.companyId) return { ok: false, status: 400, error: "Empresa obrigatória." };
  if (!input.user) return { ok: false, status: 401, error: "Sessão expirada." };
  if (!input.membership) return { ok: false, status: 403, error: "Empresa não autorizada." };
  return { ok: true };
}
