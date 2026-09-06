import Link from "next/link";

export default function StoreIndexPage() {
  return (
    <main className="store-directory-page">
      <section className="store-directory-card">
        <div className="institutional-brand"><span className="brand-mark"><span /></span><strong>ATTUAL ONE</strong></div>
        <p className="eyebrow">LOJA DIGITAL</p>
        <h1>Acesse a loja pelo endereço da empresa.</h1>
        <p>Cada negócio no Attual One possui um endereço exclusivo no formato <strong>loja.attualone.com.br/nome-da-empresa</strong>.</p>
        <p>Use o link enviado pelo estabelecimento ou digite o endereço completo no navegador.</p>
        <Link className="outline-button" href="https://attualone.com.br">Conhecer o Attual One</Link>
      </section>
    </main>
  );
}
