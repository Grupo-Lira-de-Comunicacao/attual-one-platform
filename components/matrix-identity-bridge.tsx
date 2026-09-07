"use client";

import { useEffect, useState } from "react";

export function MatrixIdentityBridge({ slug }: { slug: string }) {
  const [status, setStatus] = useState<string>("loading");
  const [code, setCode] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/account/matrix-link`, { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error(body?.error || "Falha ao consultar vínculo");
      setStatus(body.matrix_link?.status || "unlinked");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível consultar a conexão.");
    }
  }

  useEffect(() => { void load(); }, [slug]);

  async function generateCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/account/matrix-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Não foi possível gerar o código");
      setCode(String(body.bridge_code || ""));
      setExpiresAt(String(body.expires_at || ""));
      setStatus("pending");
      setMessage("Código gerado. Abra o AttualPlay > Privacidade e conclua a conexão.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Matrix Attual · M4</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Conectar sua conta ao AttualPlay</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-600">
        Esta conexão é opcional e explícita. Ela cria um identificador Matrix para continuidade de contexto e
        personalização dentro do AttualPlay. Nome, e-mail, telefone e CPF não são enviados para a Matrix por este fluxo.
        Marketing e ações comerciais automáticas continuam desativados.
      </p>

      <div className="mt-5 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-700">
        <strong>Status:</strong> {status === "linked" ? "conectado" : status === "pending" ? "aguardando confirmação no AttualPlay" : status === "unauthenticated" ? "faça login na sua conta da loja" : status === "loading" ? "carregando" : status === "unlinked" ? "não conectado" : status}
      </div>

      {status === "unauthenticated" ? (
        <p className="mt-4 text-sm text-neutral-600">Entre na sua conta da loja e volte a esta página para gerar o código.</p>
      ) : (
        <button
          type="button"
          onClick={generateCode}
          disabled={busy}
          className="mt-5 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Gerando..." : status === "linked" ? "Gerar novo código de reconexão" : "Gerar código de conexão"}
        </button>
      )}

      {code && (
        <div className="mt-5 rounded-2xl border border-neutral-200 p-4">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Código temporário</span>
          <div className="mt-2 break-all font-mono text-xl font-semibold text-neutral-950">{code}</div>
          {expiresAt && <p className="mt-2 text-xs text-neutral-500">Expira em {new Date(expiresAt).toLocaleString("pt-BR")}.</p>}
        </div>
      )}

      {message && <p className="mt-4 text-sm text-neutral-600" aria-live="polite">{message}</p>}
    </section>
  );
}
