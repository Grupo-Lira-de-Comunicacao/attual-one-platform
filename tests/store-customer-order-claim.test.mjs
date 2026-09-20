import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrderClaimToken,
  isValidOrderClaimToken,
  normalizeOrderClaimRequests,
} from "../lib/store-customer-order-claim.ts";

test("gera comprovante local de 256 bits em hexadecimal", () => {
  const first = createOrderClaimToken();
  const second = createOrderClaimToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.match(second, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test("valida somente comprovante de claim no formato esperado", () => {
  assert.equal(isValidOrderClaimToken("a".repeat(64)), true);
  assert.equal(isValidOrderClaimToken("a".repeat(63)), false);
  assert.equal(isValidOrderClaimToken("z".repeat(64)), false);
  assert.equal(isValidOrderClaimToken(null), false);
});

test("normaliza claims válidos, remove duplicados e ignora UUID sem comprovante", () => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  const token = "a".repeat(64);
  assert.deepEqual(normalizeOrderClaimRequests([
    { orderId, claimToken: token },
    { orderId, claimToken: "b".repeat(64) },
    { orderId:"22222222-2222-4222-8222-222222222222" },
    { orderId:"inválido", claimToken:token },
  ]), [{ orderId, claimToken:token }]);
});
