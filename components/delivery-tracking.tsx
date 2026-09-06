"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, CheckCircle2, Clock3, MapPin, PackageCheck, RefreshCw, Store } from "lucide-react";
import type { PublicDeliveryTracking } from "@/lib/delivery-types";

const steps = [
  ["pending", "Pedido recebido"],
  ["ready", "Pronto para sair"],
  ["out_for_delivery", "Saiu para entrega"],
  ["delivered", "Entregue"],
] as const;

const rank: Record<string, number> = { pending: 0, assigned: 0, ready: 1, out_for_delivery: 2, delivered: 3, cancelled: -1 };

export function DeliveryTracking({ token }: { token: string }) {
  const [tracking, setTracking] = useState<PublicDeliveryTracking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const response = await fetch(`/api/delivery/track/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await response.json() as { tracking?: PublicDeliveryTracking; error?: string };
      if (!response.ok || !body.tracking) throw new Error(body.error || "Não foi possível acompanhar a entrega.");
      setTracking(body.tracking);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível acompanhar a entrega.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [token]);

  const mapUrl = useMemo(() => {
    const loc = tracking?.currentLocation;
    if (!loc) return null;
    const d = 0.012;
    const bbox = `${loc.lng - d}%2C${loc.lat - d}%2C${loc.lng + d}%2C${loc.lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat}%2C${loc.lng}`;
  }, [tracking?.currentLocation]);

  if (loading) return <main className="min-h-screen bg-slate-50 grid place-items-center p-6"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Localizando seu pedido...</p></div></main>;
  if (!tracking) return <main className="min-h-screen bg-slate-50 grid place-items-center p-6"><div className="max-w-md rounded-2xl bg-white p-8 shadow"><h1 className="text-xl font-black">Rastreamento indisponível</h1><p className="mt-3 text-sm text-slate-600">{error}</p></div></main>;

  const currentRank = rank[tracking.deliveryStatus] ?? 0;
  const destination = tracking.destination ? [tracking.destination.street, tracking.destination.number, tracking.destination.district, tracking.destination.city].filter(Boolean).join(", ") : "Endereço de entrega";

  return <main className="min-h-screen bg-slate-100 text-slate-900">
    <header className="bg-slate-950 px-5 py-5 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div><p className="text-xs font-black tracking-[.18em] text-sky-400">SIGA SUA ENTREGA</p><h1 className="mt-1 text-xl font-black">{tracking.storeName}</h1></div>
        <span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Pedido #{tracking.orderNumber}</span>
      </div>
    </header>

    <div className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-6">
      {tracking.deliveryStatus === "cancelled" ? <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-black text-red-600">Entrega cancelada</h2><p className="mt-2 text-sm text-slate-600">Entre em contato com o estabelecimento para mais informações.</p></section> : <>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700"><Bike/></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Status agora</p><h2 className="mt-1 text-xl font-black">{tracking.deliveryStatus === "out_for_delivery" ? "Seu pedido está a caminho" : tracking.deliveryStatus === "delivered" ? "Pedido entregue" : tracking.deliveryStatus === "ready" ? "Pedido pronto" : tracking.driverName ? "Motoboy designado" : "Preparando seu pedido"}</h2>{tracking.driverName && <p className="mt-2 text-sm text-slate-600">Entregador: <strong>{tracking.driverName}</strong></p>}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {mapUrl && tracking.deliveryStatus === "out_for_delivery" ? <iframe title="Localização do motoboy" src={mapUrl} className="h-72 w-full border-0" loading="lazy"/> : <div className="grid h-52 place-items-center bg-slate-200 p-6 text-center text-slate-600"><div><MapPin className="mx-auto mb-3"/><strong className="block">{tracking.deliveryStatus === "delivered" ? "Entrega concluída" : "O mapa aparece quando o motoboy iniciar a rota"}</strong><small className="mt-2 block">A localização é atualizada automaticamente.</small></div></div>}
          <div className="flex items-start gap-3 border-t border-slate-100 p-4"><MapPin className="mt-0.5 shrink-0 text-slate-500" size={18}/><div><small className="font-bold text-slate-500">Destino</small><p className="text-sm font-semibold">{destination}</p></div></div>
          {tracking.currentLocation && <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><Clock3 size={14}/> Última localização: {new Date(tracking.currentLocation.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-5 font-black">Andamento</h2>
          <div className="grid gap-4">
            {steps.map(([status,label], index) => {
              const done = currentRank >= index;
              const Icon = index === 0 ? Store : index === 1 ? PackageCheck : index === 2 ? Bike : CheckCircle2;
              return <div className="flex items-center gap-3" key={status}><span className={`grid h-9 w-9 place-items-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}><Icon size={18}/></span><span className={done ? "font-bold" : "text-slate-400"}>{label}</span></div>;
            })}
          </div>
        </section>
      </>}
      {error && <p className="text-center text-xs text-amber-700">Última atualização falhou. Tentando novamente automaticamente.</p>}
    </div>
  </main>;
}
