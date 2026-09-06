"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, Check, Copy, ExternalLink, MapPin, Phone, RefreshCw, Search, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { DeliveryStatus } from "@/lib/delivery-types";

type DeliveryRow = {
  id: string;
  status: DeliveryStatus;
  driver_name: string | null;
  driver_phone: string | null;
  public_tracking_token: string;
  driver_access_token: string;
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  assigned_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
  updated_at: string;
  orders: { number: number; status: string; customer_name: string; customer_phone: string | null; delivery_address: Record<string, unknown> | null; total_cents: number } | null;
  companies: { name: string; slug: string } | null;
};

const labels: Record<DeliveryStatus,string> = { pending:"Aguardando motoboy", assigned:"Motoboy designado", ready:"Pronto", out_for_delivery:"Em rota", delivered:"Entregue", cancelled:"Cancelada" };

export function DeliveryManager({ companyId }: { companyId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [copied, setCopied] = useState("");
  const [appOrigin, setAppOrigin] = useState("https://app.attualone.com.br");

  async function load() {
    if (!companyId) return;
    setLoading(true); setError("");
    const { data, error: requestError } = await supabase.from("deliveries")
      .select("id,status,driver_name,driver_phone,public_tracking_token,driver_access_token,current_lat,current_lng,last_location_at,assigned_at,started_at,delivered_at,updated_at,orders(number,status,customer_name,customer_phone,delivery_address,total_cents),companies(name,slug)")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (requestError) setError(requestError.message);
    else setRows((data ?? []) as unknown as DeliveryRow[]);
    setLoading(false);
  }

  useEffect(() => { setAppOrigin(window.location.origin); void load(); }, [companyId]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [companyId]);

  const filtered = rows.filter((row) => {
    const text = `${row.orders?.number ?? ""} ${row.orders?.customer_name ?? ""} ${row.orders?.customer_phone ?? ""} ${row.driver_name ?? ""}`.toLowerCase();
    const statusOk = status === "all" || (status === "active" ? !["delivered","cancelled"].includes(row.status) : row.status === status);
    return text.includes(search.toLowerCase()) && statusOk;
  });

  async function assign(row: DeliveryRow) {
    if (!driverName.trim()) return;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("deliveries").update({
      driver_name: driverName.trim(),
      driver_phone: driverPhone.trim() || null,
      status: row.status === "pending" || row.status === "ready" ? "assigned" : row.status,
      assigned_at: row.assigned_at ?? now,
      updated_at: now,
    }).eq("id", row.id);
    if (updateError) { setError(updateError.message); return; }
    setEditing(null); setDriverName(""); setDriverPhone(""); await load();
  }

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key); window.setTimeout(() => setCopied(""), 1800);
  }

  if (!companyId) return <div className="page"><p>Selecione uma empresa.</p></div>;
  return <div className="page">
    <section className="page-heading"><div><p className="eyebrow">OPERAÇÃO</p><h1>Entregas</h1><p>Designe o motoboy e acompanhe as entregas em tempo real.</p></div><button className="outline-button" onClick={()=>void load()}><RefreshCw size={16}/> Atualizar</button></section>
    <div className="catalog-toolbar"><label className="catalog-search"><Search size={17}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Pedido, cliente, telefone ou motoboy..."/></label><label className="catalog-select"><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="active">Em andamento</option><option value="all">Todas</option><option value="pending">Aguardando</option><option value="assigned">Designadas</option><option value="out_for_delivery">Em rota</option><option value="delivered">Entregues</option></select></label></div>
    {error && <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="catalog-loading">Carregando entregas...</div> : <div className="grid gap-4 xl:grid-cols-2">
      {filtered.length === 0 && <div className="panel col-span-full p-8 text-center text-slate-500">Nenhuma entrega encontrada.</div>}
      {filtered.map((row) => {
        const addr = row.orders?.delivery_address ?? {};
        const destination = [addr.street,addr.number,addr.district,addr.city].filter(Boolean).join(", ");
        const driverUrl = `${appOrigin}/motoboy/${row.driver_access_token}`;
        const storeSlug = row.companies?.slug ?? "";
        const trackingUrl = `https://loja.attualone.com.br/${storeSlug}/rastreamento/${row.public_tracking_token}`;
        const activeLocation = row.current_lat != null && row.current_lng != null;
        return <article key={row.id} className="panel overflow-hidden p-0">
          <header className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="text-xs font-black tracking-wider text-slate-500">PEDIDO</p><h2 className="text-xl font-black">#{row.orders?.number}</h2></div><span className={`order-status ${row.orders?.status ?? "new"}`}>{labels[row.status]}</span></header>
          <div className="grid gap-4 p-5">
            <div className="flex items-start gap-3"><UserRound className="mt-0.5 text-slate-500" size={18}/><div><strong>{row.orders?.customer_name}</strong>{row.orders?.customer_phone && <small className="mt-1 flex items-center gap-1 text-slate-500"><Phone size={12}/>{row.orders.customer_phone}</small>}</div></div>
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-red-500" size={18}/><div><small className="font-bold text-slate-500">DESTINO</small><p className="text-sm font-semibold">{destination || "Endereço não informado"}</p></div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-3"><Bike className="text-sky-600"/><div><small className="font-bold text-slate-500">MOTOBOY</small><strong className="block">{row.driver_name || "Ainda não designado"}</strong>{row.driver_phone && <small>{row.driver_phone}</small>}</div></div>{activeLocation && <p className="mt-3 text-xs text-emerald-700">GPS ativo · última posição {row.last_location_at ? new Date(row.last_location_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "agora"}</p>}</div>
            {editing === row.id ? <div className="grid gap-2 rounded-xl border border-slate-200 p-3"><input className="rounded-lg border border-slate-200 px-3 py-2" value={driverName} onChange={(e)=>setDriverName(e.target.value)} placeholder="Nome do motoboy"/><input className="rounded-lg border border-slate-200 px-3 py-2" value={driverPhone} onChange={(e)=>setDriverPhone(e.target.value)} placeholder="Telefone"/><div className="flex gap-2"><button className="primary-button" onClick={()=>void assign(row)}>Salvar</button><button className="outline-button" onClick={()=>setEditing(null)}>Cancelar</button></div></div> : <button className="outline-button justify-center" onClick={()=>{setEditing(row.id);setDriverName(row.driver_name ?? "");setDriverPhone(row.driver_phone ?? "");}}>Designar / alterar motoboy</button>}
            <div className="grid gap-2 sm:grid-cols-2"><button className="outline-button justify-center" onClick={()=>void copy(driverUrl,`${row.id}:driver`)}>{copied===`${row.id}:driver`?<Check size={16}/>:<Copy size={16}/>} Link do motoboy</button><button className="outline-button justify-center" onClick={()=>void copy(trackingUrl,`${row.id}:track`)}>{copied===`${row.id}:track`?<Check size={16}/>:<Copy size={16}/>} Link do cliente</button></div>
            {activeLocation && <a className="outline-button justify-center" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${row.current_lat}&mlon=${row.current_lng}#map=17/${row.current_lat}/${row.current_lng}`}><ExternalLink size={16}/> Ver posição no mapa</a>}
          </div>
        </article>;
      })}
    </div>}
  </div>;
}
