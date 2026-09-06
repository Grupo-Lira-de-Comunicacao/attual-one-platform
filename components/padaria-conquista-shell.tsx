"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Storefront } from "@/components/storefront";

export function PadariaConquistaShell() {
  const [ready, setReady] = useState(false);
  const [adult, setAdult] = useState(false);

  useEffect(() => {
    const accepted = window.localStorage.getItem("attual-one:padaria-conquista:age18") === "yes";
    setAdult(accepted);
    setReady(true);
  }, []);

  function confirmAdult() {
    window.localStorage.setItem("attual-one:padaria-conquista:age18", "yes");
    document.cookie = "attual_age_18=1; Max-Age=86400; Path=/; SameSite=Lax";
    setAdult(true);
  }

  if (!ready) return null;

  if (!adult) {
    return <main className="pc-age-page">
      <section className="pc-age-card">
        <img src="/brands/padaria-conquista-logo.jpg" alt="Padaria e Pizzaria Conquista" />
        <p>PADARIA E PIZZARIA CONQUISTA</p>
        <h1>Bem-vindo à Padaria do Mineiro</h1>
        <div className="pc-age-alert"><ShieldCheck size={22}/><span><strong>Conteúdo com bebidas alcoólicas</strong><small>Para visualizar a loja completa, confirme que você tem 18 anos ou mais. A entrega de bebida alcoólica deve ser feita somente a maior de idade.</small></span></div>
        <button onClick={confirmAdult}>Tenho 18 anos ou mais</button>
        <a href="https://attualone.com.br">Sair da loja</a>
      </section>
      <style jsx global>{`
        .pc-age-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#5f2016,#a33b26 52%,#d79a36)}
        .pc-age-card{width:min(460px,100%);padding:30px;text-align:center;background:#fffaf1;border-radius:22px;box-shadow:0 28px 80px #2a0d0855}
        .pc-age-card img{width:140px;height:auto;margin:auto;border-radius:14px}
        .pc-age-card>p{margin:18px 0 5px;color:#a33b26;font-size:10px;font-weight:900;letter-spacing:1.6px}
        .pc-age-card h1{margin:0 0 18px;color:#51241d;font-size:28px;line-height:1.08}
        .pc-age-alert{display:flex;gap:12px;text-align:left;padding:14px;border:1px solid #ead7b8;background:#fff4dd;border-radius:12px;color:#6b3d28}
        .pc-age-alert span{display:flex;flex-direction:column;gap:4px}.pc-age-alert small{line-height:1.5;color:#80634f}
        .pc-age-card button{width:100%;margin-top:18px;border:0;border-radius:10px;padding:13px 16px;background:#a33b26;color:white;font-weight:900;cursor:pointer}
        .pc-age-card a{display:block;margin-top:12px;color:#816f64;font-size:11px}
      `}</style>
    </main>;
  }

  return <div className="padaria-conquista-theme">
    <Storefront slug="padaria-conquista" />
    <style jsx global>{`
      .padaria-conquista-theme{--petroleum:#7f2f20;--petroleum-deep:#5f2016;--blue:#c84f32;--blue-light:#fff0e9;--coral:#d79a36;--orange:#d79a36}
      .padaria-conquista-theme .public-store,.padaria-conquista-theme .store-loading{background:#fffaf3}
      .padaria-conquista-theme .store-cover{background:linear-gradient(115deg,#5b1e15,#8f3020 58%,#b54a2f)}
      .padaria-conquista-theme .cover-pattern{background:radial-gradient(circle at 80% 20%,#e2ad4e55 0 12%,transparent 13%),radial-gradient(circle at 70% 80%,#fff2cc20 0 18%,transparent 19%)}
      .padaria-conquista-theme .store-logo{font-size:0;background:#fff url('/brands/padaria-conquista-logo.jpg') center/contain no-repeat;border:1px solid #ead6bd}
      .padaria-conquista-theme .store-logo.hero{width:104px;height:88px;border-radius:16px}
      .padaria-conquista-theme .store-brand .store-logo{width:46px;height:40px;border-radius:9px}
      .padaria-conquista-theme .store-product-photo{background:linear-gradient(135deg,#f7ead5,#eccca8)}
      .padaria-conquista-theme .food-placeholder{color:#9a3b28}
      .padaria-conquista-theme .store-footer{background:#f2e3d1}
    `}</style>
  </div>;
}
