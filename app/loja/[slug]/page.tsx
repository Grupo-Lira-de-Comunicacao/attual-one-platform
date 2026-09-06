import type { Metadata } from "next";

import { PadariaConquistaShell } from "@/components/padaria-conquista-shell";
import { Storefront } from "@/components/storefront";

export const metadata: Metadata = {
  title: "Loja | ATTUAL ONE",
  description: "Loja online criada com ATTUAL ONE.",
};

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "padaria-conquista") return <PadariaConquistaShell />;
  return <Storefront slug={slug} />;
}
