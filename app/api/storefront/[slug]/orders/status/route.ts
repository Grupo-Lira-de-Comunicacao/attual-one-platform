import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Status público de pedido não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

  let body: { orderIds?: unknown };
  try {
    body = await request.json() as { orderIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  }

  if (!Array.isArray(body.orderIds)) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  const ids = Array.from(new Set(body.orderIds.filter((value): value is string => typeof value === "string" && uuidPattern.test(value)))).slice(0, 20);
  if (ids.length === 0) return NextResponse.json({ orders: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const admin = adminClient();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .eq("public_store_enabled", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

    const { data: rows, error } = await admin
      .from("orders")
      .select("id,status,payment_status,updated_at")
      .eq("company_id", company.id)
      .eq("source", "store")
      .is("deleted_at", null)
      .in("id", ids);
    if (error) throw error;

    const response = NextResponse.json({
      orders: (rows ?? []).map((row) => ({
        id: String(row.id),
        status: String(row.status),
        paymentStatus: String(row.payment_status),
        updatedAt: String(row.updated_at),
      })),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[store-order-status] falha ao consultar pedidos", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível atualizar os pedidos." }, { status: 503 });
  }
}
