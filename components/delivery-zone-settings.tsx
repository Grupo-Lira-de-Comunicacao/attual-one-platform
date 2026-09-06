"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type DeliveryZone = {
  id: string;
  name: string;
  fee_cents: number;
  distance_band: string | null;
  display_order: number;
  is_default: boolean;
  active: boolean;
  feeInput: string;
};

const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:bg-slate-100";

function toCents(value: string) {
  const normalized = value.replace(",", ".").trim();
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function toFeeInput(cents: number) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2).replace(".", ",");
}

export function DeliveryZoneSettings({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({ name: "", fee: "", distanceBand: "" });

  async function loadZones() {
    setLoading(true);
    const result = await supabase
      .from("delivery_zones")
      .select("id,name,fee_cents,distance_band,display_order,is_default,active")
      .eq("company_id", companyId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (result.error) {
      setStatus(`Não foi possível carregar as taxas: ${result.error.message}`);
      setLoading(false);
      return;
    }

    const rows = (result.data ?? []) as Omit<DeliveryZone, "feeInput">[];
    setZones(rows.map((row) => ({ ...row, feeInput: toFeeInput(row.fee_cents) })));
    setLoading(false);
  }

  useEffect(() => {
    void loadZones();
  }, [companyId]);

  function patchZone(id: string, patch: Partial<DeliveryZone>) {
    setZones((current) => current.map((zone) => zone.id === id ? { ...zone, ...patch } : zone));
  }

  async function saveZone(zone: DeliveryZone) {
    const name = zone.name.trim();
    if (!name) {
      setStatus("Informe o nome do bairro ou zona.");
      return;
    }

    setBusyId(zone.id);
    setStatus("");

    if (zone.is_default) {
      const clearDefault = await supabase
        .from("delivery_zones")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .neq("id", zone.id)
        .eq("is_default", true);
      if (clearDefault.error) {
        setStatus(clearDefault.error.code === "42501" ? "Somente proprietário ou gerente pode alterar as taxas de entrega." : `Não foi possível alterar a zona padrão: ${clearDefault.error.message}`);
        setBusyId(null);
        return;
      }
    }

    const result = await supabase
      .from("delivery_zones")
      .update({
        name,
        fee_cents: toCents(zone.feeInput),
        distance_band: zone.distance_band?.trim() || null,
        is_default: zone.is_default,
        active: zone.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", zone.id)
      .eq("company_id", companyId);

    setBusyId(null);
    if (result.error) {
      setStatus(result.error.code === "42501" ? "Somente proprietário ou gerente pode alterar as taxas de entrega." : `Não foi possível salvar a taxa: ${result.error.message}`);
      return;
    }

    setStatus(`${name}: taxa salva com sucesso.`);
    await loadZones();
  }

  async function addZone() {
    const name = draft.name.trim();
    if (!name) {
      setStatus("Informe o nome do novo bairro ou zona.");
      return;
    }

    setBusyId("new");
    setStatus("");
    const nextOrder = zones.reduce((max, zone) => Math.max(max, zone.display_order), 0) + 10;
    const result = await supabase.from("delivery_zones").insert({
      company_id: companyId,
      name,
      fee_cents: toCents(draft.fee),
      distance_band: draft.distanceBand.trim() || null,
      display_order: nextOrder,
      is_default: false,
      active: true,
    });

    setBusyId(null);
    if (result.error) {
      setStatus(result.error.code === "23505" ? "Esse bairro já está cadastrado." : result.error.code === "42501" ? "Somente proprietário ou gerente pode cadastrar taxas de entrega." : `Não foi possível adicionar o bairro: ${result.error.message}`);
      return;
    }

    setDraft({ name: "", fee: "", distanceBand: "" });
    setStatus(`${name}: bairro adicionado.`);
    await loadZones();
  }

  async function removeZone(zone: DeliveryZone) {
    if (!window.confirm(`Remover a taxa de entrega de ${zone.name}?`)) return;
    setBusyId(zone.id);
    setStatus("");
    const result = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", zone.id)
      .eq("company_id", companyId);
    setBusyId(null);
    if (result.error) {
      setStatus(result.error.code === "42501" ? "Somente proprietário ou gerente pode remover taxas de entrega." : `Não foi possível remover: ${result.error.message}`);
      return;
    }
    setStatus(`${zone.name}: taxa removida.`);
    await loadZones();
  }

  return <section className="panel max-w-4xl space-y-5">
    <div>
      <p className="eyebrow">DELIVERY</p>
      <h2 className="text-xl font-bold text-slate-900">Taxas por bairro</h2>
      <p className="mt-1 text-sm text-slate-600">O cliente escolhe o bairro no checkout e o servidor recalcula a taxa. A zona marcada como padrão atende bairros ainda não cadastrados.</p>
    </div>

    {loading ? <p className="text-sm text-slate-500">Carregando bairros...</p> : zones.length === 0 ? <p className="text-sm text-slate-500">Nenhuma zona de entrega cadastrada.</p> : <div className="space-y-3">
      {zones.map((zone) => <div key={zone.id} className={`rounded-xl border p-4 ${zone.is_default ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.7fr]">
          <label className="text-xs font-semibold text-slate-600">Bairro / zona
            <input className={`mt-1 ${fieldClass}`} value={zone.name} onChange={(e) => patchZone(zone.id, { name: e.target.value })}/>
          </label>
          <label className="text-xs font-semibold text-slate-600">Faixa de distância
            <input className={`mt-1 ${fieldClass}`} value={zone.distance_band ?? ""} placeholder="Ex.: ~2 a 4 km" onChange={(e) => patchZone(zone.id, { distance_band: e.target.value })}/>
          </label>
          <label className="text-xs font-semibold text-slate-600">Taxa (R$)
            <input className={`mt-1 ${fieldClass}`} inputMode="decimal" value={zone.feeInput} onChange={(e) => patchZone(zone.id, { feeInput: e.target.value })}/>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={zone.active} onChange={(e) => patchZone(zone.id, { active: e.target.checked })}/> Ativa</label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={zone.is_default} onChange={(e) => patchZone(zone.id, { is_default: e.target.checked })}/> Zona padrão</label>
          <div className="ml-auto flex gap-2">
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void removeZone(zone)} disabled={busyId === zone.id}>Remover</button>
            <button className="primary-button" onClick={() => void saveZone(zone)} disabled={busyId === zone.id}>{busyId === zone.id ? "Salvando..." : "Salvar taxa"}</button>
          </div>
        </div>
      </div>)}
    </div>}

    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-800">Adicionar bairro</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_1fr_0.7fr_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-600">Bairro / zona<input className={`mt-1 ${fieldClass}`} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}/></label>
        <label className="text-xs font-semibold text-slate-600">Faixa de distância<input className={`mt-1 ${fieldClass}`} placeholder="Ex.: ~4 a 6 km" value={draft.distanceBand} onChange={(e) => setDraft((d) => ({ ...d, distanceBand: e.target.value }))}/></label>
        <label className="text-xs font-semibold text-slate-600">Taxa (R$)<input className={`mt-1 ${fieldClass}`} inputMode="decimal" placeholder="0,00" value={draft.fee} onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))}/></label>
        <button className="primary-button" onClick={() => void addZone()} disabled={busyId === "new"}>{busyId === "new" ? "Adicionando..." : "Adicionar"}</button>
      </div>
    </div>

    {status && <p className="text-xs text-slate-600">{status}</p>}
  </section>;
}
