import Link from "next/link";

export default function InstitutionalPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-[68vh] max-w-6xl flex-col justify-center px-6 py-20 sm:px-10">
        <div className="mb-10 flex items-center gap-3 text-sm font-black tracking-[0.18em]"><span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-white"><span className="h-3 w-3 rounded bg-sky-400" /></span> ATTUAL ONE</div>
        <p className="mb-4 text-xs font-black tracking-[0.22em] text-sky-400">GESTÃO + LOJA DIGITAL</p>
        <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">Seu negócio em uma operação simples, conectada e pronta para vender.</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Centralize catálogo, pedidos, estoque, clientes, pagamentos, cupons, fidelidade e relatórios em uma plataforma multiempresa.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-sky-500 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-sky-400" href="https://app.attualone.com.br/login">Acessar painel</Link>
          <Link className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-extrabold text-slate-100 transition hover:border-slate-400" href="https://loja.attualone.com.br">Acessar lojas</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-3 sm:px-10">
        {[
          ["Painel operacional", "Pedidos, produtos, estoque e clientes com isolamento por empresa."],
          ["Loja pública", "Cada empresa usa seu próprio endereço em loja.attualone.com.br/[slug]."],
          ["Gestão inteligente", "Pagamentos, cupons, fidelidade e relatórios conectados ao Supabase."],
        ].map(([title, copy]) => <article key={title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><strong className="text-base">{title}</strong><p className="mt-3 text-sm leading-6 text-slate-400">{copy}</p></article>)}
      </section>
    </main>
  );
}
