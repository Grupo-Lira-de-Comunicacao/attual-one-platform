const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const claimTokenPattern = /^[0-9a-f]{64}$/i;

export type OrderClaimRequest = {
  orderId: string;
  claimToken: string;
};

export function isValidOrderClaimToken(value: unknown): value is string {
  return typeof value === "string" && claimTokenPattern.test(value);
}

export function createOrderClaimToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function normalizeOrderClaimRequests(value: unknown): OrderClaimRequest[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, OrderClaimRequest>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.orderId !== "string" || !uuidPattern.test(row.orderId)) continue;
    if (!isValidOrderClaimToken(row.claimToken)) continue;
    if (!unique.has(row.orderId)) unique.set(row.orderId, { orderId: row.orderId, claimToken: row.claimToken });
    if (unique.size >= 20) break;
  }
  return Array.from(unique.values());
}
