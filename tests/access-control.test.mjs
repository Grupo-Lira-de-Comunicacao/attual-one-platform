import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccessDecision } from "../lib/access-control.ts";

const authenticated = { id: "user-1" };
const ownMembership = [{ company_id: "company-1" }];

test("visitante anônimo na raiz é redirecionado para /login", () => {
  const decision = resolveAccessDecision({ pathname: "/", user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false });
  assert.equal(decision.action, "redirect");
  assert.match(decision.to, /^\/login\?retorno=/);
});

for (const pathname of ["/pedidos", "/estoque", "/clientes", "/relatorios"]) {
  test(`visitante anônimo não acessa ${pathname}`, () => {
    const decision = resolveAccessDecision({ pathname, user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false });
    assert.deepEqual(decision, { action: "redirect", to: `/login?retorno=${encodeURIComponent(pathname)}` });
  });
}

test("/loja permanece pública para visitante anônimo", () => {
  const decision = resolveAccessDecision({ pathname: "/loja", user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "allow" });
});

test("/login, /recuperar-senha, /nova-senha e /auth/callback permanecem públicas", () => {
  for (const pathname of ["/login", "/recuperar-senha", "/nova-senha", "/auth/callback"]) {
    assert.deepEqual(resolveAccessDecision({ pathname, user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false }), { action: "allow" });
  }
});

test("receptor Casting permanece público no proxy e protegido pelo Bearer secret da rota", () => {
  const decision = resolveAccessDecision({ pathname: "/api/integrations/casting/events", user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "allow" });
});

test("usuário autenticado com empresa selecionada e vínculo ativo acessa normalmente", () => {
  const decision = resolveAccessDecision({ pathname: "/pedidos", user: authenticated, memberships: ownMembership, selectedCompanyId: "company-1", isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "allow" });
});

test("usuário autenticado sem nenhum vínculo ativo é redirecionado para /sem-empresa", () => {
  const decision = resolveAccessDecision({ pathname: "/pedidos", user: authenticated, memberships: [], selectedCompanyId: null, isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "redirect", to: "/sem-empresa" });
});

test("usuário autenticado sem empresa selecionada (ou cookie de outra empresa) é redirecionado para /selecionar-empresa", () => {
  assert.deepEqual(resolveAccessDecision({ pathname: "/pedidos", user: authenticated, memberships: ownMembership, selectedCompanyId: null, isPlatformAdmin: false }), { action: "redirect", to: "/selecionar-empresa" });
  assert.deepEqual(resolveAccessDecision({ pathname: "/pedidos", user: authenticated, memberships: ownMembership, selectedCompanyId: "company-outra", isPlatformAdmin: false }), { action: "redirect", to: "/selecionar-empresa" });
});

test("usuário autenticado visitando /login é redirecionado para a raiz", () => {
  assert.deepEqual(resolveAccessDecision({ pathname: "/login", user: authenticated, memberships: ownMembership, selectedCompanyId: "company-1", isPlatformAdmin: false }), { action: "redirect", to: "/" });
});

test("rotas de seleção de empresa continuam acessíveis sem empresa selecionada", () => {
  for (const pathname of ["/selecionar-empresa", "/sem-empresa", "/api/company/select"]) {
    assert.deepEqual(resolveAccessDecision({ pathname, user: authenticated, memberships: [], selectedCompanyId: null, isPlatformAdmin: false }), { action: "allow" });
  }
});

// --- Painel Mestre (/mestre) ---

test("visitante anônimo em /mestre é redirecionado para /login (antes de qualquer checagem de admin)", () => {
  const decision = resolveAccessDecision({ pathname: "/mestre", user: null, memberships: null, selectedCompanyId: null, isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "redirect", to: "/login?retorno=%2Fmestre" });
});

test("usuário autenticado comum (não platform admin) em /mestre é redirecionado para a raiz", () => {
  const decision = resolveAccessDecision({ pathname: "/mestre", user: authenticated, memberships: ownMembership, selectedCompanyId: "company-1", isPlatformAdmin: false });
  assert.deepEqual(decision, { action: "redirect", to: "/" });
});

test("platform admin acessa /mestre mesmo sem nenhuma empresa vinculada nem selecionada", () => {
  const decision = resolveAccessDecision({ pathname: "/mestre", user: authenticated, memberships: [], selectedCompanyId: null, isPlatformAdmin: true });
  assert.deepEqual(decision, { action: "allow" });
});

test("platform admin acessa /mestre normalmente com empresa vinculada e selecionada", () => {
  const decision = resolveAccessDecision({ pathname: "/mestre", user: authenticated, memberships: ownMembership, selectedCompanyId: "company-1", isPlatformAdmin: true });
  assert.deepEqual(decision, { action: "allow" });
});

test("isolamento do painel normal: ser platform admin não dispensa vínculo de empresa em rotas comuns", () => {
  const decision = resolveAccessDecision({ pathname: "/pedidos", user: authenticated, memberships: [], selectedCompanyId: null, isPlatformAdmin: true });
  assert.deepEqual(decision, { action: "redirect", to: "/sem-empresa" });
});
