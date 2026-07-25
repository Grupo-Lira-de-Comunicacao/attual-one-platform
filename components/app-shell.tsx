"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, CircleDollarSign, Gift, Import,
  LayoutDashboard, Menu, ReceiptText, Search, Settings,
  ShoppingBag, Users, X, Bell, Plus,
} from "lucide-react";
import { SessionAction } from "@/components/session-action";
import { CompanySwitcher } from "@/components/company-switcher";
import { roleLabel, type Identity } from "@/lib/supabase/identity";
import type { CompanyMembership } from "@/lib/supabase/session";

const initials = (name: string) => name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

const navigation = [
  { label: "Visão geral", href: "/", icon: LayoutDashboard },
  { label: "Pedidos", href: "/pedidos", icon: ReceiptText, badge: "8" },
  { label: "Produtos", href: "/produtos", icon: ShoppingBag },
  { label: "Estoque", href: "/estoque", icon: Boxes, badge: "3" },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Cupons e fidelidade", href: "/cupons-e-fidelidade", icon: Gift },
  { label: "Pagamentos", href: "/pagamentos", icon: CircleDollarSign },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  { label: "Importação", href: "/importacao", icon: Import },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

export function AppShell({ children, identity, memberships, selectedCompanyId }: { children: React.ReactNode; identity: Identity; memberships: CompanyMembership[]; selectedCompanyId: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (["/loja", "/login", "/recuperar-senha", "/nova-senha", "/sem-empresa", "/selecionar-empresa", "/mestre"].some((prefix) => pathname.startsWith(prefix))) return <>{children}</>;

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
          {navigation.slice(0, 7).map((item) => <NavItem key={item.href} item={item} active={pathname === item.href} close={() => setOpen(false)} />)}
          <p className="nav-label nav-label-spaced">GESTÃO</p>
          {navigation.slice(7).map((item) => <NavItem key={item.href} item={item} active={pathname === item.href} close={() => setOpen(false)} />)}
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

function NavItem({ item, active, close }: { item: (typeof navigation)[number]; active: boolean; close: () => void }) {
  const Icon = item.icon;
  return <Link href={item.href} onClick={close} className={`nav-item ${active ? "active" : ""}`}><Icon size={19} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</Link>;
}
