import test from "node:test";
import assert from "node:assert/strict";
import { selectSidebarBadges } from "../lib/sidebar-counters.ts";

test("badges refletem os números reais do snapshot da empresa atual", () => {
  const badges = selectSidebarBadges({ openOrders: 5, lowStock: 2 });
  assert.deepEqual(badges, { "/pedidos": 5, "/estoque": 2 });
});

test("duas empresas com contagens diferentes produzem badges diferentes (sem número fixo entre empresas)", () => {
  const empresaA = selectSidebarBadges({ openOrders: 12, lowStock: 0 });
  const empresaB = selectSidebarBadges({ openOrders: 1, lowStock: 7 });
  assert.notDeepEqual(empresaA, empresaB);
  assert.equal(empresaA["/pedidos"], 12);
  assert.equal(empresaB["/pedidos"], 1);
  assert.equal(empresaA["/estoque"], 0);
  assert.equal(empresaB["/estoque"], 7);
});

test("estoque baixo igual a zero aparece como 0, não fica escondido", () => {
  const badges = selectSidebarBadges({ openOrders: 0, lowStock: 0 });
  assert.equal(badges["/pedidos"], 0);
  assert.equal(badges["/estoque"], 0);
});

test("sem dados carregados (null, carregando ou erro) nenhum badge é produzido — nunca um número falso", () => {
  const badges = selectSidebarBadges(null);
  assert.equal(badges["/pedidos"], undefined);
  assert.equal(badges["/estoque"], undefined);
});
