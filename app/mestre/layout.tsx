import type { ReactNode } from "react";
import Link from "next/link";
import { SessionAction } from "@/components/session-action";

export default function MestreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mestre-shell">
      <header className="mestre-topbar">
        <Link href="/mestre" className="mestre-brand"><strong>ATTUAL ONE</strong><small>Painel Mestre</small></Link>
        <SessionAction />
      </header>
      <main className="mestre-main">{children}</main>
    </div>
  );
}
