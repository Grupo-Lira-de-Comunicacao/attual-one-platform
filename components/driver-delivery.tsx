"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, MapPin, Navigation, Phone, RefreshCw, ShieldCheck, Store } from "lucide-react";
import type { DriverDelivery } from "@/lib/delivery-types";

export function DriverDeliveryView({ token }: { token: string }) {
  const [delivery, setDelivery] = useState<DriverDelivery | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  async function load() {
    try {
      const response = await fetch(`/api/delivery/driver/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await response.json() as { delivery?: DriverDelivery; error?: string };
      if (!response.ok || !body.delivery) throw new Error(body.error || "Entrega indisponível.");
      setDelivery(body.delivery);
      setDriverName(body.delivery.driverName ?? "");
      setDriverPhone(body.delivery.driverPhone ?? "");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Entrega indisponível.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  useEffect(() => {
    if (delivery?.deliveryStatus === "out_for_delivery" && !sharing) startSharing();
    if (["delivered", "cancelled"].includes(delivery?.deliveryStatus ?? "")) stopSharing();
    return () => stopSharing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.deliveryStatus]);

  async function patch(payload: Record<string, unknown>) {
    const response = await fetch(`/api/delivery/driver/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as { delivery?: DriverDelivery; error?: string };
    if (!response.ok || !body.delivery) throw new Error(body.error || "Não foi possível atualizar a entrega.");
    setDelivery(body.delivery);
    return body.delivery;
  }

  async function changeStatus(status: "assigned" | "out_for_delivery" | "delivered") {
    setBusy(true); setError("");
    try {
      const next = await patch(status === "assigned" ? { status, driverName, driverPhone } : { status });
      if (next.deliveryStatus === "out_for_delivery") startSharing();
      if (next.deliveryStatus === "delivered") stopSharing();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível atualizar a entrega.");
    } finally { setBusy(false); }
  }

  async function verifyAdultDocument() {
    if (!delivery?.requiresAgeDocument || delivery.ageHandoffStatus === "verified") return;
    if (!window.confirm("Você conferiu um documento com foto e confirmou que a pessoa que receberá a bebida tem 18 anos ou mais?")) return;
    setBusy(true); setError("");
    try {
      await patch({ ageVerified: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível registrar a conferência do documento.");
    } finally { setBusy(false); }
  }

  function startSharing() {
    if (watchId.current !== null || !navigator.geolocation) return;
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < 7000) return;
        lastSentAt.current = now;
        void patch({ location: { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy } }).catch((requestError) => {
          setError(requestError instanceof Error ? requestError.message : "Falha ao enviar localização.");
        });
      },
      () => setError("Ative a localização do celular para compartilhar a rota."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stopSharing() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }

  if (!delivery && !error) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Carregando entrega...</p></div></main>;
  if (!delivery) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6"><div className="max-w-md rounded-2xl bg-white/10 p-7"><h1 className="text-xl font-black">Acesso indisponível</h1><p className="mt-3 text-sm text-slate-300">{error}</p></div></main>;

  const destination = delivery.destination ? [delivery.destination.street, delivery.destination.number, delivery.destination.district, delivery.destination.city].filter(Boolean).join(", ") : "Endereço não informado";
  const mapsHref = delivery.destination ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` : undefined;
  const canStart = delivery.orderStatus === "ready" && !["out_for_delivery","delivered","cancelled"].includes(delivery.deliveryStatus);
  const ageVerified = !delivery.requiresAgeDocument || delivery.ageHandoffStatus === "verified";

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-white/10 px-5 py-4"><div className="mx-auto flex max-w-xl items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500"><Bike/></span><div><strong className="block">ATTUAL ONE Entregas</strong><small className="text-slate-400">{delivery.storeName}</small></div></div><span className="rounded-lg bg-white/10 px-3 py-2 text-sm font-black">#{delivery.orderNumber}</span></div></header>

    <div className="mx-auto grid max-w-xl gap-4 p-4 pb-10">
      <section className="rounded-2xl bg-white p-5 text-slate-900">
        <p className="text-xs font-black tracking-wider text-sky-700">CLIENTE</p>
        <h1 className="mt-1 text-xl font-black">{delivery.customerName}</h1>
        {delivery.customerPhone && <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-sky-700" href={`tel:${delivery.customerPhone}`}><Phone size={17}/>{delivery.customerPhone}</a>}
      </section>

      <section className="rounded-2xl bg-white p-5 text-slate-900">
        <div className="flex gap-3"><MapPin className="mt-1 shrink-0 text-red-500"/><div><small className="font-bold text-slate-500">DESTINO</small><p className="mt-1 font-bold">{destination}</p>{mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white"><Navigation size={17}/> Abrir navegação</a>}</div></div>
      </section>

      {delivery.requiresAgeDocument && <section className={`rounded-2xl p-5 ${ageVerified?"bg-emerald-100 text-emerald-950":"bg-amber-100 text-amber-950"}`}><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0"/><div><strong className="block text-lg">{ageVerified?"Documento 18+ conferido":"Bebida alcoólica — conferir documento"}</strong><p className="mt-1 text-sm leading-5">{ageVerified?"A conferência de maioridade foi registrada para este pedido.":"Entregue a bebida somente depois de conferir documento com foto de uma pessoa maior de 18 anos. Se não houver comprovação, não entregue a bebida e contate a loja."}</p></div></div>{delivery.deliveryStatus==="out_for_delivery"&&!ageVerified&&<button disabled={busy} onClick={()=>void verifyAdultDocument()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-3 font-black text-white disabled:opacity-50"><ShieldCheck size={17}/>{busy?"Registrando...":"Conferi documento 18+"}</button>}</section>}

      {delivery.deliveryStatus === "pending" && <section className="rounded-2xl bg-white p-5 text-slate-900"><h2 className="font-black">Identifique-se para esta entrega</h2><div className="mt-4 grid gap-3"><input className="rounded-xl border border-slate-200 px-4 py-3" value={driverName} onChange={(e)=>setDriverName(e.target.value)} placeholder="Nome do motoboy"/><input className="rounded-xl border border-slate-200 px-4 py-3" value={driverPhone} onChange={(e)=>setDriverPhone(e.target.value)} placeholder="Telefone (opcional)"/><button disabled={busy || !driverName.trim()} onClick={()=>void changeStatus("assigned")} className="rounded-xl bg-sky-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy?"Salvando...":"Assumir entrega"}</button></div></section>}

      {delivery.deliveryStatus === "assigned" && <section className="rounded-2xl bg-amber-100 p-5 text-amber-950"><div className="flex items-center gap-3"><Store/><div><strong className="block">Aguardando pedido ficar pronto</strong><small>Quando o pedido estiver pronto, o botão para iniciar a rota será liberado.</small></div></div></section>}

      {canStart && <button disabled={busy} onClick={()=>void changeStatus("out_for_delivery")} className="flex items-center justify-center gap-3 rounded-2xl bg-sky-500 px-5 py-5 text-lg font-black text-white shadow-lg"><Bike/> {busy?"Iniciando...":"Iniciar entrega e compartilhar GPS"}</button>}

      {delivery.deliveryStatus === "out_for_delivery" && <section className="rounded-2xl bg-emerald-500 p-5 text-white"><div className="flex items-start gap-3"><Navigation className={sharing?"animate-pulse":""}/><div><strong className="block text-lg">Entrega em andamento</strong><small>{sharing?"GPS sendo compartilhado com o cliente.":"Ative a localização para compartilhar a rota."}</small></div></div><button disabled={busy||!ageVerified} onClick={()=>void changeStatus("delivered")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-4 font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircle2/> {busy?"Finalizando...":ageVerified?"Marcar como entregue":"Confira documento 18+ antes de concluir"}</button></section>}

      {delivery.deliveryStatus === "delivered" && <section className="rounded-2xl bg-emerald-100 p-6 text-center text-emerald-900"><CheckCircle2 className="mx-auto mb-3" size={36}/><h2 className="text-xl font-black">Entrega concluída</h2><p className="mt-2 text-sm">O compartilhamento de localização foi encerrado.</p></section>}

      {delivery.deliveryStatus === "cancelled" && <section className="rounded-2xl bg-red-100 p-5 text-red-900"><strong>Esta entrega foi cancelada.</strong></section>}
      {error && <p className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">{error}</p>}
      <p className="text-center text-xs leading-5 text-slate-500">Durante o MVP, mantenha esta tela aberta enquanto estiver em rota. O aplicativo nativo poderá manter o GPS ativo em segundo plano.</p>
    </div>
  </main>;
}
