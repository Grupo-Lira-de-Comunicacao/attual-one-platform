export function normalizeCustomerPhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export type ClaimCandidate = {
  id: string;
  customerId?: string | null;
  customerPhone?: string | null;
};

export function claimableCustomerOrderIds(
  rows: ClaimCandidate[],
  knownOrderIds: string[],
  accountPhone: string,
): string[] {
  const allowed = new Set(knownOrderIds);
  const phone = normalizeCustomerPhone(accountPhone);
  if (phone.length < 8) return [];
  return rows
    .filter((row) =>
      allowed.has(row.id)
      && !row.customerId
      && normalizeCustomerPhone(row.customerPhone) === phone
    )
    .map((row) => row.id);
}
