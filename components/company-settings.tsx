"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  public_store_enabled: boolean;
  public_store_open: boolean;
  public_profile: Record<string, unknown> | null;
};

const inputClass = "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 disabled:bg-slate-100 disabled:text-slate-500";
const labelClass = "block text-xs font-semibold text-slate-600";

export function CompanySettings({ companyId }: { companyId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState({
    name: "", tagline: "", description: "", openingHours: "", city: "", state: "",
    deliveryFee: "0", storeEnabled: false, storeOpen: false,
  });
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      const result = await supabase.from("companies")
        .select("id,name,slug,public_store_enabled,public_store_open,public_profile")
        .eq("id", companyId)
        .single();
      if (cancelled) return;
      if (result.error) { setStatus(result.error.message); return; }
      const row = result.data as CompanyRow;
      const p = row.public_profile ?? {};
      setCompany(row);
      setForm({
        name: row.name,
        tagline: String(p.tagline ?? ""),
        description: String(p.description ?? ""),
        openingHours: String(p.opening_hours ?? ""),
        city: String(p.city ?? ""),
        state: String(p.state ?? ""),
        deliveryFee: String(Number(p.delivery_fee_cents ?? 0) / 100),
        storeEnabled: row.public_store_enabled,
        storeOpen: row.public_store_open,
      });
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId, supabase]);

  const save = async () => {
    if (!company) return;
    setSaving(true); setStatus("");
    const current = company.public_profile ?? {};
    const deliveryFeeCents = Math.max(0, Math.round(Number(form.deliveryFee.replace(",", ".")) * 100) || 0);
    const { error } = await supabase.from("companies").update({
      name: form.name.trim(),
      public_store_enabled: form.storeEnabled,
      public_store_open: form.storeOpen,
      public_profile: {
        ...current,
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        opening_hours: form.openingHours.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase().slice(0, 2),
        delivery_fee_cents: deliveryFeeCents,
      },
    }).eq("id", company.id);
    setSaving(false);
    if (error) {
      setStatus(error.code === "42501" ? "Somente o proprietário da empresa pode alterar estas configurações." : `Não foi possível salvar: ${error.message}`);
      return;
    }
    setCompany({ ...company, name: form.name.trim(), public_store_enabled: form.storeEnabled, public_store_open: form.storeOpen, public_profile: { ...current, tagline: form.tagline.trim(), description: form.description.trim(), opening_hours: form.openingHours.trim(), city: form.city.trim(), state: form.state.trim().toUpperCase().slice(0,2), delivery_fee_cents: deliveryFeeCents } });
    setStatus("Configurações salvas com sucesso.");
  };

  if (!companyId) return <div className="page"><p>Selecione uma empresa.</p></div>;
  if (!company) return <div className="page"><p>{status || "Carregando configurações..."}</p></div>;

  return <div className="page">
    <section className="page-heading"><div><p className="eyebrow">CONFIGURAÇÕES</p><h1>Empresa e loja</h1><p>Dados usados no painel e na loja pública.</p></div></section>
    <section className="panel max-w-4xl space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>Nome da empresa<input className={inputClass} value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))}/></label>
        <label className={labelClass}>Endereço público<input className={inputClass} value={`loja.attualone.com.br/${company.slug}`} disabled/></label>
      </div>
      <label className={labelClass}>Chamada da loja<input className={inputClass} value={form.tagline} onChange={(e)=>setForm(f=>({...f,tagline:e.target.value}))}/></label>
      <label className={labelClass}>Descrição<textarea className={`${inputClass} min-h-24 resize-y`} value={form.description} onChange={(e)=>setForm(f=>({...f,description:e.target.value}))}/></label>
      <label className={labelClass}>Horário de funcionamento<input className={inputClass} placeholder="Ex.: Seg a Sáb, 18h às 23h" value={form.openingHours} onChange={(e)=>setForm(f=>({...f,openingHours:e.target.value}))}/></label>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className={labelClass}>Cidade<input className={inputClass} value={form.city} onChange={(e)=>setForm(f=>({...f,city:e.target.value}))}/></label>
        <label className={labelClass}>UF<input className={inputClass} value={form.state} maxLength={2} onChange={(e)=>setForm(f=>({...f,state:e.target.value}))}/></label>
        <label className={labelClass}>Taxa de entrega (R$)<input className={inputClass} value={form.deliveryFee} inputMode="decimal" onChange={(e)=>setForm(f=>({...f,deliveryFee:e.target.value}))}/></label>
      </div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.storeEnabled} onChange={(e)=>setForm(f=>({...f,storeEnabled:e.target.checked}))}/> Loja pública habilitada</label>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.storeOpen} onChange={(e)=>setForm(f=>({...f,storeOpen:e.target.checked}))}/> Loja aberta para pedidos</label>
      </div>
      <div className="flex flex-wrap items-center gap-4"><button className="primary-button" onClick={save} disabled={saving || !form.name.trim()}>{saving?"Salvando...":"Salvar configurações"}</button>{status && <span className="text-xs text-slate-600">{status}</span>}</div>
    </section>
  </div>;
}
