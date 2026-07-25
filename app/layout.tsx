import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";
import { getSessionContext, getSelectedCompanyId } from "@/lib/supabase/session";
import { resolveIdentity } from "@/lib/supabase/identity";

export const metadata: Metadata = {
  title: { default: "ATTUAL ONE", template: "%s | ATTUAL ONE" },
  description: "Plataforma inteligente para negócios locais.",
  applicationName: "ATTUAL ONE Platform MVP",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ATTUAL ONE", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F4C5C",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, selectedCompanyId] = await Promise.all([getSessionContext(), getSelectedCompanyId()]);
  const identity = resolveIdentity({ user: session.user, memberships: session.memberships, selectedCompanyId });
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        <PwaRegister />
        <AppShell identity={identity} memberships={session.memberships} selectedCompanyId={selectedCompanyId}>{children}</AppShell>
      </body>
    </html>
  );
}
