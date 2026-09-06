import Link from "next/link";

export default function InstitutionalPage() {
  return (
    <main className="institutional-page">
      <section className="institutional-hero">
        <div className="institutional-brand"><span className="brand-mark"><span /></span><strong>ATTUAL ONE</strong></div>
        <p className="eyebrow">GESTÃO + LOJA DIGITAL</p>
        <h1>Seu negócio em uma operação simples, conectada e pronta para vender.</h1>
        <p className="institutional-copy">Centralize catálogo, pedidos, estoque, clientes, pagamentos, cupons, fidelidade e relatórios em uma plataforma multiempresa.</p>
        <div className="institutional-actions">
          <Link className="primary-button" href="https://app.attualone.com.br/login">Acessar painel</Link>
          <Link className="outline-button" href="https://loja.attualone.com.br">Acessar lojas</Link>
        </div>
      </section>
      <section className="institutional-grid">
        <article><strong>Painel operacional</strong><p>Pedidos, produtos, estoque e clientes com isolamento por empresa.</p></article>
        <article><strong>Loja pública</strong><p>Cada empresa usa seu próprio endereço em loja.attualone.com.br/[slug].</p></article>
        <article><strong>Gestão inteligente</strong><p>Pagamentos, cupons, fidelidade e relatórios conectados ao Supabase.</p></article>
      </section>
    </main>
  );
}
