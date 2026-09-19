import test from "node:test";
import assert from "node:assert/strict";
import { claimableCustomerOrderIds, normalizeCustomerPhone } from "../lib/store-customer-order-claim.ts";

test("normaliza telefone sem expor ou depender de formatação", () => {
  assert.equal(normalizeCustomerPhone("(12) 99999-0000"), "12999990000");
});

test("só permite pedido local conhecido, sem customer e com telefone compatível", () => {
  const known = ["11111111-1111-4111-8111-111111111111"];
  const rows = [
    { id: known[0], customerId:null, customerPhone:"(12) 99999-0000" },
    { id:"22222222-2222-4222-8222-222222222222", customerId:null, customerPhone:"(12) 99999-0000" },
    { id:"33333333-3333-4333-8333-333333333333", customerId:null, customerPhone:"(12) 98888-0000" },
  ];
  assert.deepEqual(claimableCustomerOrderIds(rows, known, "12 99999-0000"), [known[0]]);
});

test("não reivindica pedido já vinculado", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(claimableCustomerOrderIds([{ id, customerId:"customer", customerPhone:"12999990000" }], [id], "12999990000"), []);
});
