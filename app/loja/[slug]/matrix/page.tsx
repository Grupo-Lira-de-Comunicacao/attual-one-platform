import Link from "next/link";
import { MatrixIdentityBridge } from "@/components/matrix-identity-bridge";

export default async function MatrixLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto mb-5 max-w-2xl">
        <Link href={`/loja/${slug}`} className="text-sm font-medium text-neutral-600 hover:text-neutral-950">
          ← Voltar para a loja
        </Link>
      </div>
      <MatrixIdentityBridge slug={slug} />
    </main>
  );
}
