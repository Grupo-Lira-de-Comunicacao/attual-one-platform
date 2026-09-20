"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPin, Search, Store } from "lucide-react";

export type PublicStoreDirectoryItem = {
  name: string;
  slug: string;
  open: boolean;
  city: string;
  state: string;
  tagline: string;
  logoText: string;
};

export function PublicStoreDirectory({
  stores,
  unavailable = false,
}: {
  stores: PublicStoreDirectoryItem[];
  unavailable?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filteredStores = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return stores;
    return stores.filter((store) =>
      [store.name, store.city, store.state, store.tagline]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term)
    );
  }, [query, stores]);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-6xl">
        <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="mb-6 flex items-center gap-3 text-sm font-black tracking-[0.16em] text-slate-900">
            <span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-slate-900">
              <span className="h-3 w-3 rounded bg-sky-500" />
            </span>
            ATTUAL ONE
          </div>

          <p className="mb-3 text-xs font-black tracking-[0.2em] text-sky-600">LOJAS DIGITAIS</p>
          <h1 className="max-w-3xl text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Encontre uma loja e faça seu pedido.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Acesse as lojas públicas do ATTUAL One em um só lugar. Você também pode continuar usando o endereço direto da sua loja favorita.
          </p>

          <label className="mt-7 flex max-w-2xl items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-sky-400 focus-within:bg-white">
            <Search className="shrink-0 text-slate-400" size={19} />
            <input
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por loja, cidade ou estado"
              aria-label="Buscar lojas"
            />
          </label>
        </header>

        {unavailable ? (
          <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <strong>As lojas estão temporariamente indisponíveis.</strong>
            <p className="mt-1 text-sm">Tente novamente em alguns instantes ou use o link direto enviado pelo estabelecimento.</p>
          </section>
        ) : filteredStores.length === 0 ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Search className="mx-auto text-slate-400" size={28} />
            <h2 className="mt-3 text-lg font-black text-slate-900">Nenhuma loja encontrada</h2>
            <p className="mt-1 text-sm text-slate-500">Tente buscar por outro nome ou localidade.</p>
          </section>
        ) : (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStores.map((store) => {
              const location = [store.city, store.state].filter(Boolean).join(" - ");
              return (
                <article key={store.slug} className="flex min-h-64 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-sm font-black tracking-wider text-white">
                      {store.logoText}
                    </span>
                    <span className={store.open
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
                      : "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600"
                    }>
                      {store.open ? "Aberto agora" : "Fechado agora"}
                    </span>
                  </div>

                  <div className="mt-6 flex-1">
                    <h2 className="text-xl font-black text-slate-950">{store.name}</h2>
                    {location && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                        <MapPin size={15} />
                        {location}
                      </p>
                    )}
                    {store.tagline && <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{store.tagline}</p>}
                  </div>

                  <Link
                    href={`/loja/${encodeURIComponent(store.slug)}`}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    <Store size={16} />
                    Acessar loja
                    <ArrowRight size={16} />
                  </Link>
                </article>
              );
            })}
          </section>
        )}

        <footer className="py-8 text-center text-xs text-slate-500">
          ATTUAL One · lojas públicas habilitadas na plataforma
        </footer>
      </section>
    </main>
  );
}
