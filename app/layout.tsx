import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

const PUBLIC_HOSTS = new Set(["attualone.com.br", "www.attualone.com.br", "loja.attualone.com.br"]);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const hostname = requestHeaders.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  if (PUBLIC_HOSTS.has(hostname)) {
    return (
      <html lang="pt-BR">
        <body suppressHydrationWarning>
          <PwaRegister />
          {children}
        </body>
      </html>
    );
  }

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
