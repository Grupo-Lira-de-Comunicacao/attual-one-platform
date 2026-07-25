"use client";
import { useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import type { CompanyMembership } from "@/lib/supabase/session";
import { selectCompany } from "@/lib/supabase/select-company";
import { roleLabel } from "@/lib/supabase/identity";
export function CompanySelector({ memberships }: { memberships: CompanyMembership[] }) { const [loading, setLoading] = useState(""); const [error, setError] = useState(""); const select = async (companyId: string) => { setLoading(companyId); setError(""); const result = await selectCompany(companyId); if (result.error) { setError(result.error); setLoading(""); return; } window.location.assign("/"); }; return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">MULTIEMPRESA</p><h1>Selecione a empresa</h1><p>Escolha a operação que deseja acessar.</p><div className="company-options">{memberships.map((membership) => <button key={membership.companyId} disabled={Boolean(loading)} onClick={() => select(membership.companyId)}><Building2 /><span><strong>{membership.companyName}</strong><small>{roleLabel(membership.role)}</small></span><ChevronRight /></button>)}</div>{error && <div className="auth-message">{error}</div>}</section></main>; }
