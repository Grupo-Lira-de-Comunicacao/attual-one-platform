import test from "node:test";
import assert from "node:assert/strict";
import { mergeStoredCustomerOrderStatuses } from "../lib/store-customer-memory.ts";

const baseOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 11,
  total: 39.9,
  status: "new",
  fulfillment: "pickup",
  createdAt: "2026-09-19T21:16:38.000Z",
  items: [],
};

test("mescla status atualizado do servidor sem perder o pedido local", () => {
  const result = mergeStoredCustomerOrderStatuses([baseOrder], [{
    id: baseOrder.id,
    status: "preparing",
    paymentStatus: "pending",
    updatedAt: "2026-09-19T21:17:00.000Z",
  }]);
  assert.equal(result[0].status, "preparing");
  assert.equal(result[0].paymentStatus, "pending");
  assert.equal(result[0].updatedAt, "2026-09-19T21:17:00.000Z");
  assert.equal(result[0].number, 11);
  assert.deepEqual(result[0].items, []);
});

test("ignora atualização que não pertence aos pedidos conhecidos", () => {
  const result = mergeStoredCustomerOrderStatuses([baseOrder], [{
    id: "22222222-2222-4222-8222-222222222222",
    status: "completed",
  }]);
  assert.equal(result[0].status, "new");
});
