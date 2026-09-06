import Link from "next/link";

export default function StoreIndexPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-sm font-black tracking-[0.16em] text-slate-900"><span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-slate-900"><span className="h-3 w-3 rounded bg-sky-500" /></span> ATTUAL ONE</div>
        <p className="mb-3 text-xs font-black tracking-[0.2em] text-sky-600">LOJA DIGITAL</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Acesse a loja pelo endereço da empresa.</h1>
        <p className="mt-5 text-sm leading-6 text-slate-600">Cada negócio no Attual One possui um endereço exclusivo no formato <strong className="text-slate-800">loja.attualone.com.br/nome-da-empresa</strong>.</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Use o link enviado pelo estabelecimento ou digite o endereço completo no navegador.</p>
        <Link className="mt-7 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50" href="https://attualone.com.br">Conhecer o Attual One</Link>
      </section>
    </main>
  );
}
