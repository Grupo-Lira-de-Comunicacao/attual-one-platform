import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Construction, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/catalog-manager";
import { CommerceManager } from "@/components/commerce-manager";
import { RewardsManager } from "@/components/rewards-manager";
import { ReportsManager } from "@/components/reports-manager";
import { LocalMigrationPanel } from "@/components/local-migration-panel";
import { getSelectedCompanyId } from "@/lib/supabase/session";

const sections: Record<string, { title: string; description: string }> = {
  pedidos: { title: "Pedidos", description: "Acompanhe pedidos e status da operação." },
  produtos: { title: "Produtos", description: "Organize seu catálogo, categorias e disponibilidade." },
  estoque: { title: "Estoque", description: "Visualize saldos, movimentações e alertas." },
  clientes: { title: "Clientes", description: "Centralize contatos, histórico e preferências." },
  "cupons-e-fidelidade": { title: "Cupons e fidelidade", description: "Crie benefícios para aproximar seus clientes." },
  pagamentos: { title: "Pagamentos", description: "Acompanhe formas e status de pagamento." },
  relatorios: { title: "Relatórios", description: "Entenda vendas, produtos, clientes e estoque." },
  importacao: { title: "Importação", description: "Prepare a entrada segura de dados por CSV ou Excel." },
  configuracoes: { title: "Configurações", description: "Personalize a empresa, usuários e preferências." },
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: sections[section]?.title ?? "ATTUAL ONE" };
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "produtos" || section === "estoque") { const companyId = await getSelectedCompanyId(); return <CatalogManager initialView={section === "produtos" ? "products" : "stock"} companyId={companyId ?? undefined} />; }
  if (section === "clientes" || section === "pedidos") { const companyId = await getSelectedCompanyId(); return <CommerceManager view={section === "clientes" ? "customers" : "orders"} companyId={companyId ?? undefined} />; }
  if (section === "pagamentos" || section === "cupons-e-fidelidade") { const companyId = await getSelectedCompanyId(); return <RewardsManager initialTab={section === "pagamentos" ? "payments" : "coupons"} companyId={companyId ?? undefined} />; }
  if (section === "relatorios") return <ReportsManager />;
  if (section === "importacao") return <LocalMigrationPanel />;
  const current = sections[section];
  if (!current) notFound();
  return <div className="page placeholder-page">
    <section className="page-heading"><div><p className="eyebrow">MÓDULO</p><h1>{current.title}</h1><p>{current.description}</p></div><button className="primary-button"><Plus size={18} /> Nova ação</button></section>
    <section className="empty-state"><span><Construction size={32} /></span><h2>Fundação pronta</h2><p>Esta página já faz parte da navegação do MVP. Os fluxos e regras reais serão implementados em uma próxima etapa.</p><Link href="/"><ArrowLeft size={17} /> Voltar ao dashboard</Link></section>
  </div>;
}
