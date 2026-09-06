"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Boxes, CircleDollarSign, Gift, Import,
  LayoutDashboard, Menu, ReceiptText, Search, Settings,
  ShoppingBag, Users, X, Bell, Plus,
} from "lucide-react";
import { SessionAction } from "@/components/session-action";
import { CompanySwitcher } from "@/components/company-switcher";
import { roleLabel, type Identity } from "@/lib/supabase/identity";
import type { CompanyMembership } from "@/lib/supabase/session";
import { createRepositories } from "@/lib/repositories/factory";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { selectSidebarBadges, type SidebarCounts } from "@/lib/sidebar-counters";

const initials = (name: string) => name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

const NAVIGATION = [
  { label: "Visão geral", href: "/", icon: LayoutDashboard },
  { label: "Pedidos", href: "/pedidos", icon: ReceiptText },
  { label: "Produtos", href: "/produtos", icon: ShoppingBag },
  { label: "Estoque", href: "/estoque", icon: Boxes },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Cupons e fidelidade", href: "/cupons-e-fidelidade", icon: Gift },
  { label: "Pagamentos", href: "/pagamentos", icon: CircleDollarSign },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  { label: "Importação", href: "/importacao", icon: Import },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

function useSidebarCounters(companyId: string | null, enabled: boolean): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const mode = getSupabasePublicConfig().mode;
    const repo = mode === "supabase" && companyId
      ? createRepositories({ storage: window.localStorage, supabase: createSupabaseBrowserClient(), companyId })
      : createRepositories({ storage: window.localStorage });
    repo.analytics.getSnapshot("all")
      .then((snapshot) => { if (!cancelled) setCounts({ openOrders: snapshot.openOrders, lowStock: snapshot.lowStock }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId, enabled]);
  return counts;
}

export function AppShell({ children, identity, memberships, selectedCompanyId }: { children: React.ReactNode; identity: Identity; memberships: CompanyMembership[]; selectedCompanyId: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isChromeless = ["/site", "/loja", "/login", "/recuperar-senha", "/nova-senha", "/sem-empresa", "/selecionar-empresa", "/mestre"].some((prefix) => pathname.startsWith(prefix));
  const counts = useSidebarCounters(selectedCompanyId, !isChromeless);

  if (isChromeless) return <>{children}</>;

  const badges = selectSidebarBadges(counts);

  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-mark"><span /></span>
            <span><strong>ATTUAL</strong><small>ONE</small></span>
          </Link>
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <CompanySwitcher companyName={identity.companyName} memberships={memberships} selectedCompanyId={selectedCompanyId} />
        <nav aria-label="Menu principal">
          <p className="nav-label">OPERAÇÃO</p>
          {NAVIGATION.slice(0, 7).map((item) => <NavItem key={item.href} item={item} badge={badges[item.href]} active={pathname === item.href} close={() => setOpen(false)} />)}
          <p className="nav-label nav-label-spaced">GESTÃO</p>
          {NAVIGATION.slice(7).map((item) => <NavItem key={item.href} item={item} badge={badges[item.href]} active={pathname === item.href} close={() => setOpen(false)} />)}
        </nav>
        <div className="sidebar-help">
          <span className="help-icon">?</span>
          <span><strong>Precisa de ajuda?</strong><small>Acesse a central de suporte</small></span>
        </div>
        <div className="user-card">
          <span className="user-avatar">{initials(identity.userName)}</span>
          <span><strong>{identity.userName}</strong><small>{roleLabel(identity.role)}</small></span>
          <SessionAction />
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
            <div className="search-box"><Search size={18} /><input aria-label="Buscar" placeholder="Buscar pedidos, produtos ou clientes..." /><kbd>⌘ K</kbd></div>
          </div>
          <div className="topbar-actions">
            <span className="operation-status"><i /> Loja aberta</span>
            <button className="icon-button notification-button" aria-label="Notificações"><Bell size={20} /><i /></button>
            <Link className="primary-button header-button" href="/pedidos"><Plus size={18} /> Novo pedido</Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function NavItem({ item, active, close, badge }: { item: (typeof NAVIGATION)[number]; active: boolean; close: () => void; badge?: number }) {
  const Icon = item.icon;
  return <Link href={item.href} onClick={close} className={`nav-item ${active ? "active" : ""}`}><Icon size={19} /><span>{item.label}</span>{badge !== undefined && <em>{badge}</em>}</Link>;
}
