import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CASTING_EVENT_TYPES = [
  "casting.invitation.prepared",
  "casting.telegram.linked",
  "casting.invitation.sent",
  "casting.invitation.accepted",
  "casting.invitation.declined",
] as const;

export type CastingEventType = (typeof CASTING_EVENT_TYPES)[number];
export type CastingState = "prepared" | "linked" | "sent" | "accepted" | "declined";

const EVENT_STATE: Record<CastingEventType, CastingState> = {
  "casting.invitation.prepared": "prepared",
  "casting.telegram.linked": "linked",
  "casting.invitation.sent": "sent",
  "casting.invitation.accepted": "accepted",
  "casting.invitation.declined": "declined",
};

const STATE_RANK: Record<CastingState, number> = {
  prepared: 1,
  linked: 2,
  sent: 3,
  accepted: 4,
  declined: 4,
};

export function isCastingEventType(value: string): value is CastingEventType {
  return (CASTING_EVENT_TYPES as readonly string[]).includes(value);
}

export function stateForEvent(eventType: CastingEventType) {
  return EVENT_STATE[eventType];
}

export function resolveCastingState(current: CastingState | null, incoming: CastingState) {
  if (!current) return { state: incoming, conflict: false };

  const currentFinal = current === "accepted" || current === "declined";
  const incomingFinal = incoming === "accepted" || incoming === "declined";

  if (currentFinal && incomingFinal && current !== incoming) {
    return { state: current, conflict: true };
  }

  return {
    state: STATE_RANK[incoming] > STATE_RANK[current] ? incoming : current,
    conflict: false,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function payloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function verifyCastingSignature(input: {
  body: string;
  eventKey: string;
  path: string;
  secret: string;
  signature: string;
  timestamp: string;
}) {
  const timestampNumber = Number(input.timestamp);
  if (!Number.isInteger(timestampNumber)) return false;
  if (Math.abs(Date.now() - timestampNumber * 1_000) > 5 * 60 * 1_000) return false;

  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  const canonical = `${input.timestamp}\nPOST\n${input.path}\n${input.eventKey}\n${bodyHash}`;
  const expected = createHmac("sha256", input.secret).update(canonical).digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
}
