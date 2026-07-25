import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanySelection } from "../lib/company-selection.ts";

const authenticated = { id: "user-1" };

test("troca válida quando o usuário tem vínculo ativo com a empresa escolhida", () => {
  const decision = resolveCompanySelection({ companyId: "company-1", user: authenticated, membership: { company_id: "company-1" } });
  assert.deepEqual(decision, { ok: true });
});

test("empresa inexistente é rejeitada com 403, sem revelar se a empresa existe", () => {
  const decision = resolveCompanySelection({ companyId: "company-fantasma", user: authenticated, membership: null });
  assert.deepEqual(decision, { ok: false, status: 403, error: "Empresa não autorizada." });
});

test("empresa existente mas sem vínculo ativo do usuário é rejeitada com 403", () => {
  // company_users filtra por user_id + company_id + status=active: membership vem null tanto para
  // empresa inexistente quanto para empresa sem vínculo ativo — mesma resposta nos dois casos.
  const decision = resolveCompanySelection({ companyId: "company-de-outro-dono", user: authenticated, membership: null });
  assert.deepEqual(decision, { ok: false, status: 403, error: "Empresa não autorizada." });
});

test("companyId ausente é rejeitado com 400 antes de qualquer consulta", () => {
  const decision = resolveCompanySelection({ companyId: undefined, user: authenticated, membership: null });
  assert.deepEqual(decision, { ok: false, status: 400, error: "Empresa obrigatória." });
});

test("sessão ausente é rejeitada com 401 mesmo com companyId válido", () => {
  const decision = resolveCompanySelection({ companyId: "company-1", user: null, membership: null });
  assert.deepEqual(decision, { ok: false, status: 401, error: "Sessão expirada." });
});
