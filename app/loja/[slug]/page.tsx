import type { Metadata } from "next";

import { Storefront } from "@/components/storefront";

export const metadata: Metadata = {
  title: "Loja | ATTUAL ONE",
  description: "Loja online criada com ATTUAL ONE.",
};

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Storefront slug={slug} />;
}
