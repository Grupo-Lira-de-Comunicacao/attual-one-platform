export async function selectCompany(companyId: string): Promise<{ error?: string }> {
  const response = await fetch("/api/company/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) return { error: result.error ?? "Não foi possível selecionar." };
  return {};
}
