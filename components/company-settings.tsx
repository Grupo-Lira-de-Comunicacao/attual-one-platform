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
    supabase.from("companies")
      .select("id,name,slug,public_store_enabled,public_store_open,public_profile")
      .eq("id", companyId)
      .single()
      .then(({ data, error }) => {
        if (error) return setStatus(error.message);
        const row = data as CompanyRow;
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
      });
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
    setStatus(error ? `Não foi possível salvar: ${error.message}` : "Configurações salvas com sucesso.");
  };

  if (!companyId) return <div className="page"><p>Selecione uma empresa.</p></div>;
  if (!company) return <div className="page"><p>{status || "Carregando configurações..."}</p></div>;

  return <div className="page">
    <section className="page-heading"><div><p className="eyebrow">CONFIGURAÇÕES</p><h1>Empresa e loja</h1><p>Dados usados no painel e na loja pública.</p></div></section>
    <section className="panel settings-form">
      <label>Nome da empresa<input value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))}/></label>
      <label>Endereço público<input value={`loja.attualone.com.br/${company.slug}`} disabled/></label>
      <label>Chamada da loja<input value={form.tagline} onChange={(e)=>setForm(f=>({...f,tagline:e.target.value}))}/></label>
      <label>Descrição<textarea value={form.description} onChange={(e)=>setForm(f=>({...f,description:e.target.value}))}/></label>
      <label>Horário de funcionamento<input value={form.openingHours} onChange={(e)=>setForm(f=>({...f,openingHours:e.target.value}))}/></label>
      <div className="settings-inline"><label>Cidade<input value={form.city} onChange={(e)=>setForm(f=>({...f,city:e.target.value}))}/></label><label>UF<input value={form.state} maxLength={2} onChange={(e)=>setForm(f=>({...f,state:e.target.value}))}/></label><label>Taxa de entrega (R$)<input value={form.deliveryFee} inputMode="decimal" onChange={(e)=>setForm(f=>({...f,deliveryFee:e.target.value}))}/></label></div>
      <label className="settings-check"><input type="checkbox" checked={form.storeEnabled} onChange={(e)=>setForm(f=>({...f,storeEnabled:e.target.checked}))}/> Loja pública habilitada</label>
      <label className="settings-check"><input type="checkbox" checked={form.storeOpen} onChange={(e)=>setForm(f=>({...f,storeOpen:e.target.checked}))}/> Loja aberta para pedidos</label>
      <div className="settings-actions"><button className="primary-button" onClick={save} disabled={saving}>{saving?"Salvando...":"Salvar configurações"}</button>{status && <span>{status}</span>}</div>
    </section>
  </div>;
}
