import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimableCustomerOrderIds } from "@/lib/store-customer-order-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Vinculo de pedidos não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

  let body: { orderIds?: unknown };
  try {
    body = await request.json() as { orderIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!Array.isArray(body.orderIds)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const orderIds = Array.from(new Set(
    body.orderIds.filter((value): value is string => typeof value === "string" && uuidPattern.test(value)),
  )).slice(0, 20);
  if (!orderIds.length) return NextResponse.json({ linked: 0 });

  try {
    const auth = await createSupabaseServerClient();
    const { data: userData, error: userError } = await auth.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "Entre na sua conta antes de vincular pedidos." }, { status: 401 });

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

    const { data: account, error: accountError } = await admin
      .from("store_customer_accounts")
      .select("customer_id,phone")
      .eq("company_id", company.id)
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.customer_id || !String(account.phone ?? "").trim()) {
      return NextResponse.json({ error: "Salve seu nome e telefone na conta antes de vincular pedidos." }, { status: 409 });
    }

    const { data: rows, error: orderError } = await admin
      .from("orders")
      .select("id,customer_id,customer_phone")
      .eq("company_id", company.id)
      .eq("source", "store")
      .is("deleted_at", null)
      .in("id", orderIds);
    if (orderError) throw orderError;

    const candidates = claimableCustomerOrderIds(
      (rows ?? []).map((row) => ({
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        customerPhone: row.customer_phone ? String(row.customer_phone) : null,
      })),
      orderIds,
      String(account.phone),
    );

    let linked = 0;
    for (const orderId of candidates) {
      const { error } = await admin.rpc("link_public_store_order_customer", {
        p_order: orderId,
        p_customer: String(account.customer_id),
      });
      if (error) throw error;
      linked += 1;
    }

    const response = NextResponse.json({ linked });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[store-order-claim] falha ao vincular pedidos", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível vincular os pedidos agora." }, { status: 503 });
  }
}
