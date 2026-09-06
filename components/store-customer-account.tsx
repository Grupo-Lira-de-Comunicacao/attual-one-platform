"use client";

import { useEffect, useState } from "react";
import { ChevronRight, LogOut, Mail, MapPin, RotateCcw, ShoppingBag, UserRound, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  loadStoredCustomerOrders,
  loadStoreCustomerProfile,
  saveStoreCustomerProfile,
  type StoreCustomerProfile,
  type StoredCustomerOrder,
  type StoredOrderItem,
} from "@/lib/store-customer-memory";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptyProfile: StoreCustomerProfile = { name:"", phone:"", address:{ street:"", number:"", complement:"", district:"", city:"", postalCode:"" } };

type CloudOrder = StoredCustomerOrder & { paymentStatus?: string };
type CloudAccount = {
  authenticated: true;
  email: string;
  profile: StoreCustomerProfile;
  orders: CloudOrder[];
  loyalty: { points:number; purchaseCount:number; rewardsAvailable:number } | null;
};

export function StoreCustomerAccount({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<StoreCustomerProfile>(emptyProfile);
  const [orders, setOrders] = useState<StoredCustomerOrder[]>([]);
  const [cloud, setCloud] = useState<CloudAccount | null>(null);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshLocal = () => {
    setProfile(loadStoreCustomerProfile(slug) ?? emptyProfile);
    setOrders(loadStoredCustomerOrders(slug));
  };

  async function refreshCloud() {
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/account`, { cache:"no-store" });
      if (response.status === 401) { setCloud(null); return; }
      const body = await response.json() as CloudAccount | { error?: string };
      if (!response.ok || !("authenticated" in body)) throw new Error("error" in body ? body.error : "Não foi possível carregar sua conta.");
      const account = body as CloudAccount;
      setCloud(account);
      setEmail(account.email || "");
      const normalized: StoreCustomerProfile = {
        name: account.profile?.name ?? "",
        phone: account.profile?.phone ?? "",
        address: { ...emptyProfile.address, ...(account.profile?.address ?? {}) },
      };
      if (normalized.name || normalized.phone) {
        setProfile(normalized);
        saveStoreCustomerProfile(slug, normalized);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar sua conta.");
    }
  }

  useEffect(() => {
    refreshLocal();
    void refreshCloud();
    const listener = () => { refreshLocal(); void refreshCloud(); };
    window.addEventListener("attual-one:customer-memory-updated", listener);
    return () => window.removeEventListener("attual-one:customer-memory-updated", listener);
  }, [slug]);

  async function sendMagicLink() {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes("@")) { setMessage("Informe um e-mail válido."); return; }
    setBusy(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const next = `/loja/${encodeURIComponent(slug)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setMessage("Enviamos um link de acesso para seu e-mail. Abra o link neste aparelho ou em outro para entrar na sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o link de acesso.");
    } finally { setBusy(false); }
  }

  async function save() {
    saveStoreCustomerProfile(slug, profile);
    setSaved(true);
    window.dispatchEvent(new Event("attual-one:customer-memory-updated"));
    window.setTimeout(() => setSaved(false), 1800);
    if (!cloud) return;

    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/account`, {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(profile),
      });
      const body = await response.json() as CloudAccount | { error?:string };
      if (!response.ok || !("authenticated" in body)) throw new Error("error" in body ? body.error : "Não foi possível salvar sua conta.");
      setCloud(body as CloudAccount);
      setMessage("Dados salvos na sua conta. Eles ficam disponíveis quando você entrar em outro aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar sua conta.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setMessage("");
    try {
      await fetch(`/api/storefront/${encodeURIComponent(slug)}/account`, { method:"DELETE" });
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      setCloud(null);
      setMessage("Você saiu da conta. Os dados salvos neste aparelho continuam disponíveis localmente.");
    } finally { setBusy(false); }
  }

  const reorder = (order: { items: StoredOrderItem[] }) => {
    window.dispatchEvent(new CustomEvent("attual-one:reorder", { detail: order.items }));
    setOpen(false);
  };

  const address = profile.address;
  const setAddress = (key: keyof StoreCustomerProfile["address"], value: string) => setProfile((current) => ({ ...current, address:{ ...current.address, [key]:value } }));
  const visibleOrders = cloud?.orders?.length ? cloud.orders : orders;

  return <>
    <button type="button" onClick={()=>{refreshLocal();void refreshCloud();setOpen(true);}} className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl" aria-label="Abrir meus pedidos"><UserRound size={17}/> Meus pedidos</button>
    {open && <div className="store-overlay">
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Minha conta">
        <header><div><p className="eyebrow">MINHA CONTA</p><h2>Perfil e pedidos</h2></div><button onClick={()=>setOpen(false)} aria-label="Fechar"><X /></button></header>
        <div className="cart-items">
          {!cloud && <section className="py-5">
            <div className="mb-3 flex items-center gap-2"><Mail size={18}/><strong>Leve seus pedidos para qualquer aparelho</strong></div>
            <p className="mb-3 text-sm text-slate-500">Entre por link seguro no e-mail. Não precisa criar senha.</p>
            <div className="grid gap-2">
              <input type="email" className="rounded-lg border border-slate-200 px-3 py-2" placeholder="seuemail@exemplo.com" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email"/>
              <button className="store-primary" disabled={busy} onClick={()=>void sendMagicLink()}>{busy?"Enviando...":"Enviar link de acesso"}</button>
            </div>
          </section>}

          {cloud && <section className="border-b border-slate-100 py-4">
            <div className="flex items-center justify-between gap-3"><div><small className="block text-slate-500">Conta conectada</small><strong>{cloud.email}</strong></div><button className="outline-button" disabled={busy} onClick={()=>void signOut()}><LogOut size={15}/> Sair</button></div>
            {cloud.loyalty && <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-2"><strong className="block">{cloud.loyalty.points}</strong><small>Pontos</small></div><div className="rounded-lg bg-slate-50 p-2"><strong className="block">{cloud.loyalty.purchaseCount}</strong><small>Compras</small></div><div className="rounded-lg bg-slate-50 p-2"><strong className="block">{cloud.loyalty.rewardsAvailable}</strong><small>Prêmios</small></div></div>}
          </section>}

          <section className="py-5">
            <div className="mb-3 flex items-center gap-2"><UserRound size={18}/><strong>Meus dados</strong></div>
            <div className="grid gap-2">
              <input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Nome" value={profile.name} onChange={(e)=>setProfile({ ...profile, name:e.target.value })}/>
              <input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Telefone" value={profile.phone} onChange={(e)=>setProfile({ ...profile, phone:e.target.value })}/>
              <div className="mt-2 flex items-center gap-2"><MapPin size={16}/><strong>Endereço padrão</strong></div>
              <input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Rua" value={address.street} onChange={(e)=>setAddress("street",e.target.value)}/>
              <div className="grid grid-cols-2 gap-2"><input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Número" value={address.number} onChange={(e)=>setAddress("number",e.target.value)}/><input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Bairro" value={address.district} onChange={(e)=>setAddress("district",e.target.value)}/></div>
              <input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Complemento" value={address.complement} onChange={(e)=>setAddress("complement",e.target.value)}/>
              <div className="grid grid-cols-2 gap-2"><input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Cidade" value={address.city} onChange={(e)=>setAddress("city",e.target.value)}/><input className="rounded-lg border border-slate-200 px-3 py-2" placeholder="CEP" value={address.postalCode} onChange={(e)=>setAddress("postalCode",e.target.value)}/></div>
              <button className="store-primary" disabled={busy} onClick={()=>void save()}>{busy?"Salvando...":saved?"Dados salvos":cloud?"Salvar na minha conta":"Salvar neste aparelho"}</button>
              {!cloud && <small className="text-slate-500">Sem entrar na conta, estes dados ficam somente neste navegador.</small>}
            </div>
          </section>

          <section className="border-t border-slate-100 py-5">
            <div className="mb-3 flex items-center gap-2"><ShoppingBag size={18}/><strong>Meus pedidos</strong></div>
            {visibleOrders.length===0?<p className="text-sm text-slate-500">Seus próximos pedidos aparecerão aqui{cloud?" na sua conta.":" neste aparelho."}</p>:<div className="grid gap-3">{visibleOrders.map((order)=><article key={order.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><strong>Pedido #{order.number}</strong><small className="mt-1 block text-slate-500">{new Date(order.createdAt).toLocaleString("pt-BR")}</small></div><strong>{money.format(order.total)}</strong></div><p className="mt-3 text-xs text-slate-600">{order.items.map((item)=>`${item.quantity}x ${item.productName}`).join(", ")}</p><div className="mt-3 grid gap-2">{order.fulfillment==="delivery"&&order.trackingToken&&<a className="outline-button justify-center" href={`/loja/${encodeURIComponent(slug)}/rastreamento/${encodeURIComponent(order.trackingToken)}`}>Acompanhar entrega <ChevronRight size={15}/></a>}<button className="outline-button justify-center" onClick={()=>reorder(order)}><RotateCcw size={15}/> Pedir novamente</button></div></article>)}</div>}
          </section>
          {message && <p className="pb-5 text-xs text-slate-600" role="status">{message}</p>}
        </div>
      </aside>
    </div>}
  </>;
}
