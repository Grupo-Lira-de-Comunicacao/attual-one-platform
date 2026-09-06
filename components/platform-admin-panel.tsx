"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { listCompaniesForPlatformAdmin, findUserByEmailForPlatformAdmin, inviteOwnerForPlatformAdmin, createCompanyForPlatformAdmin, linkOwnerForPlatformAdmin, type PlatformCompanySummary } from "@/lib/supabase/platform-admin";

export function PlatformAdminPanel() {
  const supabase = useRef(createSupabaseBrowserClient()).current;
  const [companies, setCompanies] = useState<PlatformCompanySummary[] | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", ownerEmail: "" });
  const [linking, setLinking] = useState<{ companyId: string; email: string } | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const inform = (type: "success" | "error", text: string) => { setNotice({ type, text }); window.setTimeout(() => setNotice(null), 5000); };

  const reload = () => {
    listCompaniesForPlatformAdmin(supabase)
      .then((result) => { setCompanies(result); setCompaniesError(null); })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Não foi possível carregar as empresas.";
        setCompaniesError(message);
        inform("error", message);
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, []);

  const resolveOwner = async (email: string) => {
    const normalized = email.trim().toLowerCase();
    const existing = await findUserByEmailForPlatformAdmin(supabase, normalized);
    if (existing) return { owner: existing, invited: false };
    const invited = await inviteOwnerForPlatformAdmin(normalized);
    return { owner: invited, invited: true };
  };

  const submitCreate = async () => {
    setCreating(true);
    try {
      const { owner, invited } = await resolveOwner(form.ownerEmail);
      const result = await createCompanyForPlatformAdmin(supabase, { name: form.name.trim(), slug: form.slug.trim(), ownerUserId: owner.userId });
      if (result.error) throw new Error(result.error);
      setForm({ name: "", slug: "", ownerEmail: "" });
      inform("success", invited ? "Empresa criada e convite enviado ao proprietário." : "Empresa criada com sucesso.");
      reload();
    } catch (error) {
      inform("error", error instanceof Error ? error.message : "Falha ao criar empresa.");
    } finally {
      setCreating(false);
    }
  };

  const submitLink = async (companyId: string) => {
    if (!linking || linking.companyId !== companyId) return;
    setLinkSubmitting(true);
    try {
      const { owner, invited } = await resolveOwner(linking.email);
      const result = await linkOwnerForPlatformAdmin(supabase, { companyId, userId: owner.userId });
      if (result.error) throw new Error(result.error);
      setLinking(null);
      inform("success", invited ? "Proprietário convidado e vinculado com sucesso." : "Proprietário vinculado com sucesso.");
      reload();
    } catch (error) {
      inform("error", error instanceof Error ? error.message : "Falha ao vincular proprietário.");
    } finally {
      setLinkSubmitting(false);
    }
  };

  return (
    <div className="mestre-page">
      {notice && <div className={`toast ${notice.type}`} role="status">{notice.text}<button onClick={() => setNotice(null)}><X size={15} /></button></div>}

      <section className="mestre-panel">
        <h2>Cadastrar empresa</h2>
        <p>Informe o proprietário. Se ele ainda não tiver conta, o Attual One enviará um convite automaticamente.</p>
        <div className="mestre-form">
          <input placeholder="Nome da empresa" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input placeholder="Slug (ex: minha-empresa)" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") }))} />
          <input placeholder="E-mail do proprietário" type="email" value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} />
          <button className="primary-button" disabled={creating || !form.name.trim() || !form.slug.trim() || !form.ownerEmail.trim()} onClick={submitCreate}>{creating ? "Criando..." : "Cadastrar empresa"}</button>
        </div>
      </section>

      <section className="mestre-panel">
        <h2>Empresas</h2>
        {companies === null && !companiesError && <p>Carregando...</p>}
        {companiesError && (
          <div className="mestre-load-error" role="alert">
            <p>{companiesError}</p>
            <button className="outline-button" onClick={reload}>Tentar novamente</button>
          </div>
        )}
        {companies?.length === 0 && <p>Nenhuma empresa cadastrada.</p>}
        <div className="mestre-company-list">
          {companies?.map((company) => (
            <div className="mestre-company-row" key={company.id}>
              <span className="mestre-company-icon"><Building2 size={17} /></span>
              <span className="mestre-company-info">
                <strong>{company.name}</strong>
                <small>{company.slug} · {company.memberCount} usuário{company.memberCount === 1 ? "" : "s"}{company.deletedAt ? " · inativa" : ""}</small>
              </span>
              {linking?.companyId === company.id ? (
                <span className="mestre-inline-form">
                  <input placeholder="E-mail do proprietário" type="email" autoFocus value={linking.email} onChange={(e) => setLinking({ companyId: company.id, email: e.target.value })} />
                  <button className="primary-button" disabled={linkSubmitting || !linking.email.trim()} onClick={() => submitLink(company.id)}>Confirmar</button>
                  <button className="text-button" onClick={() => setLinking(null)}>Cancelar</button>
                </span>
              ) : (
                <button className="outline-button" onClick={() => setLinking({ companyId: company.id, email: "" })}>Vincular proprietário</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
