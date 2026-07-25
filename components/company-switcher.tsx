"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CompanyMembership } from "@/lib/supabase/session";
import { selectCompany } from "@/lib/supabase/select-company";
import { roleLabel } from "@/lib/supabase/identity";

const initials = (name: string) => name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

export function CompanySwitcher({ companyName, memberships, selectedCompanyId }: { companyName: string; memberships: CompanyMembership[]; selectedCompanyId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const canSwitch = memberships.length > 1;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const choose = async (companyId: string) => {
    if (companyId === selectedCompanyId) { setOpen(false); return; }
    setPending(companyId); setError("");
    const result = await selectCompany(companyId);
    if (result.error) { setError(result.error); setPending(""); return; }
    window.location.assign("/");
  };

  return (
    <div className="company-switcher" ref={ref}>
      <button type="button" className="business-card" onClick={() => canSwitch && setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} disabled={!canSwitch}>
        <span className="business-avatar">{initials(companyName)}</span>
        <span><small>Operando como</small><strong>{companyName}</strong></span>
        {canSwitch && <ChevronDown size={16} />}
      </button>
      {open && canSwitch && (
        <div className="company-menu" role="listbox">
          {memberships.map((membership) => (
            <button type="button" key={membership.companyId} role="option" aria-selected={membership.companyId === selectedCompanyId} className={membership.companyId === selectedCompanyId ? "selected" : ""} disabled={pending === membership.companyId} onClick={() => choose(membership.companyId)}>
              <span><strong>{membership.companyName}</strong><small>{roleLabel(membership.role)}</small></span>
            </button>
          ))}
          {error && <div className="company-menu-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}
