"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Pizza, Search, X } from "lucide-react";
import type { PublicStoreProduct } from "@/lib/public-storefront-types";
import type { StoredOrderItem } from "@/lib/store-customer-memory";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type PizzaMode = "whole" | "half";

type Props = {
  products: PublicStoreProduct[];
  disabled: boolean;
  onClose: () => void;
  onAdd: (item: StoredOrderItem) => void;
};

function priceOf(product: PublicStoreProduct) {
  return product.promotionalPrice ?? product.price;
}

function sizeRank(size: string) {
  const normalized = size.toLocaleLowerCase("pt-BR");
  if (normalized.includes("grande")) return 1;
  if (normalized.includes("média") || normalized.includes("media")) return 2;
  if (normalized.includes("pequena")) return 3;
  if (normalized.includes("broto")) return 4;
  return 10;
}

export function PizzaConfigurator({ products, disabled, onClose, onAdd }: Props) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<PizzaMode | null>(null);
  const [size, setSize] = useState("");
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  const sizes = useMemo(() => Array.from(new Set(products.map((product) => product.pizzaSize).filter((value): value is string => Boolean(value)))).sort((a,b) => sizeRank(a)-sizeRank(b) || a.localeCompare(b,"pt-BR")), [products]);
  const sizeProducts = useMemo(() => products.filter((product) => product.pizzaSize === size && product.status === "available"), [products, size]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return sizeProducts
      .filter((product) => !query || `${product.pizzaFlavor ?? product.name} ${product.description}`.toLocaleLowerCase("pt-BR").includes(query))
      .sort((a,b) => (a.pizzaFlavor ?? a.name).localeCompare(b.pizzaFlavor ?? b.name,"pt-BR"));
  }, [sizeProducts, search]);

  const first = products.find((product) => product.id === firstId);
  const second = products.find((product) => product.id === secondId);
  const finalPrice = first ? (mode === "half" && second ? Math.max(priceOf(first), priceOf(second)) : priceOf(first)) : 0;

  function chooseMode(next: PizzaMode) {
    setMode(next);
    setFirstId("");
    setSecondId("");
    setStep(2);
  }

  function chooseSize(next: string) {
    setSize(next);
    setFirstId("");
    setSecondId("");
    setSearch("");
    setStep(3);
  }

  function chooseFlavor(product: PublicStoreProduct) {
    if (mode === "whole") {
      setFirstId(product.id);
      setStep(4);
      return;
    }
    if (!firstId) {
      setFirstId(product.id);
      setSearch("");
      return;
    }
    if (product.id === firstId) return;
    setSecondId(product.id);
    setStep(4);
  }

  function back() {
    if (step <= 1) { onClose(); return; }
    if (step === 4) {
      if (mode === "half") setSecondId("");
      setStep(3);
      return;
    }
    if (step === 3) {
      setFirstId("");
      setSecondId("");
      setStep(2);
      return;
    }
    setSize("");
    setStep(1);
  }

  function add() {
    if (!first || disabled) return;
    if (mode === "half" && !second) return;
    const firstFlavor = first.pizzaFlavor ?? first.name;
    const secondFlavor = second?.pizzaFlavor ?? second?.name;
    const productName = mode === "half" && secondFlavor
      ? `½ ${firstFlavor} + ½ ${secondFlavor} — ${size}`
      : `Pizza ${size} — ${firstFlavor}`;

    onAdd({
      productId: first.id,
      productName,
      unitPrice: finalPrice,
      quantity: 1,
      additions: [],
      note: note.trim(),
      configuration: {
        kind: "pizza",
        mode: mode ?? "whole",
        size,
        ...(mode === "half" && second ? { secondProductId: second.id } : {}),
      },
    });
  }

  const steps = ["Tipo", "Tamanho", "Sabores", "Confirmar"];
  const selectingSecond = mode === "half" && Boolean(firstId) && !secondId;

  return <div className="store-overlay checkout-overlay">
    <section className="checkout-modal !max-w-2xl" role="dialog" aria-modal="true" aria-label="Montar pizza">
      <header>
        <button onClick={back} aria-label="Voltar"><ArrowLeft/></button>
        <div className="min-w-0 flex-1"><p className="eyebrow">MONTE SUA PIZZA</p><h2>Pizza {mode === "half" ? "meio a meio" : mode === "whole" ? "inteira" : ""}</h2></div>
        <button onClick={onClose} aria-label="Fechar"><X/></button>
      </header>

      <div className="border-b border-slate-100 px-5 py-3 sm:px-7">
        <div className="grid grid-cols-4 gap-2">
          {steps.map((label,index) => <div key={label} className="min-w-0">
            <div className={`h-1.5 rounded-full ${step >= index+1 ? "bg-amber-500" : "bg-slate-200"}`}/>
            <small className={`mt-1 block truncate text-[10px] font-bold ${step === index+1 ? "text-slate-900" : "text-slate-400"}`}>{index+1}. {label}</small>
          </div>)}
        </div>
      </div>

      <div className="checkout-body min-h-[420px]">
        {step === 1 && <section>
          <p className="eyebrow">PASSO 1 DE 4</p>
          <h3 className="!text-xl">Como você quer sua pizza?</h3>
          <p className="mt-1 text-sm text-slate-500">Escolha primeiro o formato. Depois você define tamanho e sabor.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={()=>chooseMode("whole")} className="group rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-amber-400 hover:bg-amber-50">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-700"><Pizza size={30}/></span>
              <strong className="block text-lg text-slate-950">Pizza inteira</strong>
              <span className="mt-1 block text-sm text-slate-500">Escolha um sabor para a pizza toda.</span>
              <span className="mt-5 flex items-center gap-1 text-sm font-bold text-amber-700">Escolher inteira <ChevronRight size={16}/></span>
            </button>
            <button type="button" onClick={()=>chooseMode("half")} className="group rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-amber-400 hover:bg-amber-50">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-700"><span className="text-2xl font-black">½</span></span>
              <strong className="block text-lg text-slate-950">Pizza meio a meio</strong>
              <span className="mt-1 block text-sm text-slate-500">Combine dois sabores do mesmo tamanho.</span>
              <span className="mt-5 flex items-center gap-1 text-sm font-bold text-amber-700">Escolher meio a meio <ChevronRight size={16}/></span>
            </button>
          </div>
        </section>}

        {step === 2 && <section>
          <p className="eyebrow">PASSO 2 DE 4</p>
          <h3 className="!text-xl">Escolha o tamanho</h3>
          <p className="mt-1 text-sm text-slate-500">No meio a meio, os dois sabores serão sempre do mesmo tamanho.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {sizes.map((value) => {
              const available = products.filter((product)=>product.pizzaSize===value&&product.status==="available");
              const minPrice = available.length ? Math.min(...available.map(priceOf)) : 0;
              return <button key={value} type="button" onClick={()=>chooseSize(value)} className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-amber-400 hover:bg-amber-50">
                <strong className="block text-lg text-slate-950">{value}</strong>
                <span className="mt-1 block text-sm text-slate-500">{available.length} sabores disponíveis</span>
                <span className="mt-4 block text-sm font-bold text-amber-700">a partir de {money.format(minPrice)}</span>
              </button>;
            })}
          </div>
        </section>}

        {step === 3 && <section>
          <p className="eyebrow">PASSO 3 DE 4</p>
          <h3 className="!text-xl">{mode === "half" ? (selectingSecond ? "Escolha a 2ª metade" : "Escolha a 1ª metade") : "Escolha o sabor"}</h3>
          {mode === "half" && first && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>1ª metade:</strong> {first.pizzaFlavor ?? first.name} · {money.format(priceOf(first))}</div>}
          <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><Search size={17} className="text-slate-400"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar sabor" className="min-w-0 flex-1 border-0 bg-transparent outline-none"/></label>
          <div className="mt-4 grid max-h-[390px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredProducts.map((product) => {
              const selected = product.id === firstId || product.id === secondId;
              const sameFirst = mode === "half" && selectingSecond && product.id === firstId;
              return <button key={product.id} type="button" disabled={sameFirst} onClick={()=>chooseFlavor(product)} className={`rounded-xl border p-4 text-left transition ${selected ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:border-amber-300"} ${sameFirst ? "cursor-not-allowed opacity-45" : ""}`}>
                <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{product.pizzaFlavor ?? product.name}</strong>{selected&&<Check size={17} className="shrink-0 text-amber-700"/>}</div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{product.description}</p>
                <div className="mt-3 flex items-center gap-2"><strong className="text-sm text-amber-800">{money.format(priceOf(product))}</strong>{product.promotionalPrice!==undefined&&<del className="text-xs text-slate-400">{money.format(product.price)}</del>}</div>
              </button>;
            })}
          </div>
          {mode === "half" && <p className="mt-4 text-xs text-slate-500">No meio a meio, o valor da pizza é o preço do sabor de maior valor.</p>}
        </section>}

        {step === 4 && first && <section>
          <p className="eyebrow">PASSO 4 DE 4</p>
          <h3 className="!text-xl">Confira sua pizza</h3>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Pizza size={25}/></span><div className="min-w-0 flex-1">
              <small className="font-bold uppercase tracking-wide text-slate-400">{mode === "half" ? "Meio a meio" : "Inteira"} · {size}</small>
              {mode === "half" && second ? <strong className="mt-1 block text-lg text-slate-950">½ {first.pizzaFlavor ?? first.name} + ½ {second.pizzaFlavor ?? second.name}</strong> : <strong className="mt-1 block text-lg text-slate-950">{first.pizzaFlavor ?? first.name}</strong>}
              <div className="mt-3 text-xl font-black text-amber-800">{money.format(finalPrice)}</div>
              {mode === "half" && second && <small className="mt-1 block text-slate-500">Cobrado pelo sabor de maior valor.</small>}
            </div></div>
          </div>
          <label className="mt-5 block text-sm font-bold text-slate-700">Observação para a cozinha
            <textarea value={note} onChange={(event)=>setNote(event.target.value.slice(0,500))} rows={3} placeholder="Ex.: sem cebola, cortar em 8 pedaços..." className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal outline-none focus:border-amber-400"/>
          </label>
        </section>}
      </div>

      {step === 4 && <footer className="!justify-between gap-3"><button type="button" onClick={back} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">Alterar sabores</button><button type="button" disabled={disabled || !first || (mode === "half" && !second)} onClick={add} className="store-primary flex-1 sm:flex-none">Adicionar ao carrinho · {money.format(finalPrice)}</button></footer>}
    </section>
  </div>;
}
