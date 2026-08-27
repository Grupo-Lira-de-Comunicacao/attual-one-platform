import assert from "node:assert/strict";
import test from "node:test";

import {
  payloadHash,
  resolveCastingState,
  stateForEvent,
} from "../lib/integrations/casting.ts";

test("mapeia os cinco eventos oficiais", () => {
  assert.equal(stateForEvent("casting.invitation.prepared"), "prepared");
  assert.equal(stateForEvent("casting.telegram.linked"), "linked");
  assert.equal(stateForEvent("casting.invitation.sent"), "sent");
  assert.equal(stateForEvent("casting.invitation.accepted"), "accepted");
  assert.equal(stateForEvent("casting.invitation.declined"), "declined");
});

test("nao regride estado e detecta conflito final", () => {
  assert.deepEqual(resolveCastingState("sent", "linked"), { state: "sent", conflict: false });
  assert.deepEqual(resolveCastingState("sent", "accepted"), { state: "accepted", conflict: false });
  assert.deepEqual(resolveCastingState("accepted", "declined"), { state: "accepted", conflict: true });
});

test("hash canonico independe da ordem das propriedades", () => {
  assert.equal(payloadHash({ a: 1, b: { c: 2 } }), payloadHash({ b: { c: 2 }, a: 1 }));
});
