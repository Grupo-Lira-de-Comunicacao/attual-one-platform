import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveIdentity, roleLabel } from "../lib/supabase/identity.ts";

const memberships = [
  { companyId: "company-1", companyName: "Hamburgueria 07", role: "owner" },
  { companyId: "company-2", companyName: "Pizzaria Central", role: "manager" },
];

test("usuário autenticado com nome cadastrado usa o nome real", () => {
  const identity = resolveIdentity({ user: { email: "dono@empresa.com", user_metadata: { full_name: "Ana Souza" } }, memberships, selectedCompanyId: "company-1" });
  assert.equal(identity.userName, "Ana Souza");
});

test("sem full_name cadastrado, usa o e-mail como nome", () => {
  const identity = resolveIdentity({ user: { email: "dono@empresa.com", user_metadata: {} }, memberships, selectedCompanyId: "company-1" });
  assert.equal(identity.userName, "dono@empresa.com");
});

test("ausência de sessão nunca ativa fallback de Mariana Lima/Hamburgueria 07 — usa fallback neutro", () => {
  const identity = resolveIdentity({ user: null, memberships: [], selectedCompanyId: null });
  assert.equal(identity.userName, "Usuário");
  assert.equal(identity.companyName, "Empresa");
  assert.equal(identity.role, "");
  assert.notEqual(identity.userName, "Mariana Lima");
  assert.notEqual(identity.companyName, "Hamburgueria 07");
});

test("empresa selecionada aparece corretamente quando o vínculo corresponde ao cookie", () => {
  const identity = resolveIdentity({ user: { email: "dono@empresa.com" }, memberships, selectedCompanyId: "company-2" });
  assert.equal(identity.companyName, "Pizzaria Central");
  assert.equal(identity.role, "manager");
});

test("nunca mostra dados de outro tenant quando a empresa selecionada não corresponde a nenhum vínculo", () => {
  const identity = resolveIdentity({ user: { email: "dono@empresa.com" }, memberships, selectedCompanyId: "company-inexistente" });
  assert.equal(identity.companyName, "Empresa");
  assert.equal(identity.role, "");
  assert.notEqual(identity.companyName, "Hamburgueria 07");
  assert.notEqual(identity.companyName, "Pizzaria Central");
});

test("componentes de UI não contêm mais 'Mariana Lima' ou 'Hamburgueria 07' hardcoded", async () => {
  for (const path of ["../components/app-shell.tsx", "../components/real-dashboard.tsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Mariana Lima|Mariana!|Hamburgueria 07/);
  }
});

test("roleLabel traduz papéis conhecidos e preserva desconhecidos", () => {
  assert.equal(roleLabel("owner"), "Proprietário(a)");
  assert.equal(roleLabel("manager"), "Gerente");
  assert.equal(roleLabel("attendant"), "Atendente");
  assert.equal(roleLabel("operator"), "Operador(a)");
  assert.equal(roleLabel(""), "");
  assert.equal(roleLabel("papel-novo"), "papel-novo");
});
