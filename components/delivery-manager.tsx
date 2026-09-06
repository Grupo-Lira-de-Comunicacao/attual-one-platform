"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, Check, Copy, ExternalLink, MapPin, MessageCircle, Phone, RefreshCw, Search, Send, UserRound } from "lucide-react";
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
const statusPriority: Record<DeliveryStatus, number> = { pending:0, ready:1, assigned:2, out_for_delivery:3, delivered:4, cancelled:5 };

function normalizeWhatsAppPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function whatsappUrl(phone: string, message: string) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

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
  }).sort((a,b) => {
    const aNeedsDriver = a.status === "pending" && !a.driver_name ? -1 : 0;
    const bNeedsDriver = b.status === "pending" && !b.driver_name ? -1 : 0;
    if (aNeedsDriver !== bNeedsDriver) return aNeedsDriver - bNeedsDriver;
    if (statusPriority[a.status] !== statusPriority[b.status]) return statusPriority[a.status] - statusPriority[b.status];
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });

  const pendingCount = rows.filter((row) => row.status === "pending" && !row.driver_name).length;
  const assignedCount = rows.filter((row) => ["assigned","ready"].includes(row.status)).length;
  const routeCount = rows.filter((row) => row.status === "out_for_delivery").length;

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

  async function shareLink(title: string, text: string, url: string, key: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    await copy(`${text}\n${url}`, key);
  }

  if (!companyId) return <div className="page"><p>Selecione uma empresa.</p></div>;
  return <div className="page">
    <section className="page-heading"><div><p className="eyebrow">OPERAÇÃO</p><h1>Entregas</h1><p>Pedidos de entrega em prioridade, designação do motoboy e acompanhamento em tempo real.</p></div><button className="outline-button" onClick={()=>void load()}><RefreshCw size={16}/> Atualizar</button></section>

    <div className="mb-5 grid gap-3 md:grid-cols-3">
      <button type="button" onClick={()=>setStatus("pending")} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:border-amber-300">
        <span className="text-xs font-bold text-amber-700">Aguardando motoboy</span><strong className="mt-1 block text-2xl text-amber-950">{pendingCount}</strong><small className="text-amber-700">prioridade operacional</small>
      </button>
      <button type="button" onClick={()=>setStatus("assigned")} className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-left shadow-sm transition hover:border-sky-300">
        <span className="text-xs font-bold text-sky-700">Designadas / prontas</span><strong className="mt-1 block text-2xl text-sky-950">{assignedCount}</strong><small className="text-sky-700">aguardando saída</small>
      </button>
      <button type="button" onClick={()=>setStatus("out_for_delivery")} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:border-emerald-300">
        <span className="text-xs font-bold text-emerald-700">Em rota agora</span><strong className="mt-1 block text-2xl text-emerald-950">{routeCount}</strong><small className="text-emerald-700">GPS em acompanhamento</small>
      </button>
    </div>

    {pendingCount > 0 && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-700"><Bike size={21}/></span><div><strong className="block text-amber-950">{pendingCount === 1 ? "1 pedido novo de entrega precisa de motoboy" : `${pendingCount} pedidos novos de entrega precisam de motoboy`}</strong><small className="text-amber-700">Eles aparecem primeiro na fila até serem designados.</small></div></div><button className="primary-button" onClick={()=>setStatus("pending")}>Designar agora</button></div>}

    <div className="catalog-toolbar"><label className="catalog-search"><Search size={17}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Pedido, cliente, telefone ou motoboy..."/></label><label className="catalog-select"><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="active">Em andamento</option><option value="all">Todas</option><option value="pending">Aguardando</option><option value="assigned">Designadas</option><option value="ready">Prontas</option><option value="out_for_delivery">Em rota</option><option value="delivered">Entregues</option></select></label></div>
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
        const needsDriver = row.status === "pending" && !row.driver_name;
        const driverMessage = `Nova entrega do pedido #${row.orders?.number ?? ""} da ${row.companies?.name ?? "loja"}. Abra o link para ver o destino, iniciar a rota e compartilhar o GPS:`;
        const customerMessage = `Seu pedido #${row.orders?.number ?? ""} está com acompanhamento de entrega. Você pode seguir o andamento por este link:`;
        const driverWhatsApp = row.driver_phone ? whatsappUrl(row.driver_phone, `${driverMessage}\n${driverUrl}`) : "";
        const customerWhatsApp = row.orders?.customer_phone ? whatsappUrl(row.orders.customer_phone, `${customerMessage}\n${trackingUrl}`) : "";
        return <article key={row.id} className={`panel overflow-hidden p-0 ${needsDriver ? "ring-2 ring-amber-300" : ""}`}>
          <header className={`flex items-center justify-between border-b p-5 ${needsDriver ? "border-amber-200 bg-amber-50" : "border-slate-100"}`}><div><div className="flex items-center gap-2"><p className="text-xs font-black tracking-wider text-slate-500">PEDIDO</p>{needsDriver && <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-black text-amber-900">NOVA ENTREGA</span>}</div><h2 className="text-xl font-black">#{row.orders?.number}</h2></div><span className={`order-status ${row.orders?.status ?? "new"}`}>{labels[row.status]}</span></header>
          <div className="grid gap-4 p-5">
            <div className="flex items-start gap-3"><UserRound className="mt-0.5 text-slate-500" size={18}/><div><strong>{row.orders?.customer_name}</strong>{row.orders?.customer_phone && <small className="mt-1 flex items-center gap-1 text-slate-500"><Phone size={12}/>{row.orders.customer_phone}</small>}</div></div>
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-red-500" size={18}/><div><small className="font-bold text-slate-500">DESTINO</small><p className="text-sm font-semibold">{destination || "Endereço não informado"}</p></div></div>
            <div className={`rounded-xl p-4 ${needsDriver ? "bg-amber-50" : "bg-slate-50"}`}><div className="flex items-center gap-3"><Bike className={needsDriver ? "text-amber-600" : "text-sky-600"}/><div><small className="font-bold text-slate-500">MOTOBOY</small><strong className="block">{row.driver_name || "Ainda não designado"}</strong>{row.driver_phone && <small>{row.driver_phone}</small>}</div></div>{activeLocation && <p className="mt-3 text-xs text-emerald-700">GPS ativo · última posição {row.last_location_at ? new Date(row.last_location_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "agora"}</p>}</div>

            {editing === row.id ? <div className="grid gap-2 rounded-xl border border-slate-200 p-3"><input className="rounded-lg border border-slate-200 px-3 py-2" value={driverName} onChange={(e)=>setDriverName(e.target.value)} placeholder="Nome do motoboy" autoFocus/><input className="rounded-lg border border-slate-200 px-3 py-2" value={driverPhone} onChange={(e)=>setDriverPhone(e.target.value)} placeholder="Telefone / WhatsApp"/><div className="flex flex-wrap gap-2"><button className="primary-button" onClick={()=>void assign(row)}>Salvar motoboy</button><button className="outline-button" onClick={()=>setEditing(null)}>Cancelar</button></div></div> : <button className={needsDriver ? "primary-button justify-center" : "outline-button justify-center"} onClick={()=>{setEditing(row.id);setDriverName(row.driver_name ?? "");setDriverPhone(row.driver_phone ?? "");}}>{needsDriver ? "Designar motoboy agora" : "Designar / alterar motoboy"}</button>}

            {row.driver_name && <div className="grid gap-2 sm:grid-cols-2">
              {driverWhatsApp ? <a className="primary-button justify-center" target="_blank" rel="noreferrer" href={driverWhatsApp}><MessageCircle size={16}/> Enviar ao motoboy</a> : <button className="primary-button justify-center" onClick={()=>void shareLink(`Entrega #${row.orders?.number ?? ""}`,driverMessage,driverUrl,`${row.id}:driver-share`)}>{copied===`${row.id}:driver-share`?<Check size={16}/>:<Send size={16}/>} Enviar ao motoboy</button>}
              {customerWhatsApp ? <a className="outline-button justify-center" target="_blank" rel="noreferrer" href={customerWhatsApp}><MessageCircle size={16}/> Enviar ao cliente</a> : <button className="outline-button justify-center" onClick={()=>void shareLink(`Pedido #${row.orders?.number ?? ""}`,customerMessage,trackingUrl,`${row.id}:customer-share`)}>{copied===`${row.id}:customer-share`?<Check size={16}/>:<Send size={16}/>} Enviar ao cliente</button>}
            </div>}

            <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-600">Mais opções</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><button className="outline-button justify-center" onClick={()=>void copy(driverUrl,`${row.id}:driver`)}>{copied===`${row.id}:driver`?<Check size={16}/>:<Copy size={16}/>} Copiar link do motoboy</button><button className="outline-button justify-center" onClick={()=>void copy(trackingUrl,`${row.id}:track`)}>{copied===`${row.id}:track`?<Check size={16}/>:<Copy size={16}/>} Copiar link do cliente</button></div></details>
            {activeLocation && <a className="outline-button justify-center" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${row.current_lat}&mlon=${row.current_lng}#map=17/${row.current_lat}/${row.current_lng}`}><ExternalLink size={16}/> Ver posição no mapa</a>}
          </div>
        </article>;
      })}
    </div>}
  </div>;
}
