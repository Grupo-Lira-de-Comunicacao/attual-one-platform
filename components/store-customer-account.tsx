"use client";

import { useEffect, useState } from "react";
import { ChevronRight, MapPin, RotateCcw, ShoppingBag, UserRound, X } from "lucide-react";
import {
  loadStoredCustomerOrders,
  loadStoreCustomerProfile,
  saveStoreCustomerProfile,
  type StoreCustomerProfile,
  type StoredCustomerOrder,
} from "@/lib/store-customer-memory";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const emptyProfile: StoreCustomerProfile = {
  name: "",
  phone: "",
  address: { street: "", number: "", complement: "", district: "", city: "", postalCode: "" },
};

export function StoreCustomerAccount({ slug, open, onClose, onReorder }: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onReorder: (order: StoredCustomerOrder) => void;
}) {
  const [profile, setProfile] = useState<StoreCustomerProfile>(emptyProfile);
  const [orders, setOrders] = useState<StoredCustomerOrder[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfile(loadStoreCustomerProfile(slug) ?? emptyProfile);
    setOrders(loadStoredCustomerOrders(slug));
  }, [open, slug]);

  if (!open) return null;

  const save = () => {
    saveStoreCustomerProfile(slug, profile);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const address = profile.address;
  const setAddress = (key: keyof StoreCustomerProfile["address"], value: string) =>
    setProfile((current) => ({ ...current, address: { ...current.address, [key]: value } }));

  return (
    <div className="store-overlay">
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Minha conta">
        <header>
          <div><p className="eyebrow">MINHA CONTA</p><h2>Perfil e pedidos</h2></div>
          <button onClick={onClose} aria-label="Fechar"><X /></button>
        </header>
        <div className="cart-items">
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
              <button className="store-primary" onClick={save}>{saved ? "Dados salvos" : "Salvar meus dados"}</button>
            </div>
          </section>

          <section className="border-t border-slate-100 py-5">
            <div className="mb-3 flex items-center gap-2"><ShoppingBag size={18}/><strong>Meus pedidos</strong></div>
            {orders.length === 0 ? <p className="text-sm text-slate-500">Seus próximos pedidos aparecerão aqui neste aparelho.</p> : <div className="grid gap-3">
              {orders.map((order) => (
                <article key={order.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><strong>Pedido #{order.number}</strong><small className="mt-1 block text-slate-500">{new Date(order.createdAt).toLocaleString("pt-BR")}</small></div><strong>{money.format(order.total)}</strong></div>
                  <p className="mt-3 text-xs text-slate-600">{order.items.map((item)=>`${item.quantity}x ${item.productName}`).join(", ")}</p>
                  <div className="mt-3 grid gap-2">
                    {order.fulfillment === "delivery" && order.trackingToken && <a className="outline-button justify-center" href={`/loja/${encodeURIComponent(slug)}/rastreamento/${encodeURIComponent(order.trackingToken)}`}>Acompanhar entrega <ChevronRight size={15}/></a>}
                    <button className="outline-button justify-center" onClick={()=>onReorder(order)}><RotateCcw size={15}/> Pedir novamente</button>
                  </div>
                </article>
              ))}
            </div>}
          </section>
        </div>
      </aside>
    </div>
  );
}
