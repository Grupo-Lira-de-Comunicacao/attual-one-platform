export interface SidebarCounts { openOrders: number; lowStock: number }

// Mapeamento puro snapshot -> badges da sidebar, sem I/O, para permitir teste unitário direto.
// `counts` nulo (carregando ou erro) não produz nenhum valor — nunca mostra número falso.
export function selectSidebarBadges(counts: SidebarCounts | null): Record<string, number | undefined> {
  return { "/pedidos": counts?.openOrders, "/estoque": counts?.lowStock };
}
