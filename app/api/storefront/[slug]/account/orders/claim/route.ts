import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeOrderClaimRequests } from "@/lib/store-customer-order-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Vinculo de pedidos não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });

  let claims;
  try {
    const body = await request.json() as { claims?: unknown };
    claims = normalizeOrderClaimRequests(body.claims);
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!claims.length) return NextResponse.json({ linked: 0, rejected: 0 });

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
      .select("customer_id")
      .eq("company_id", company.id)
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.customer_id) {
      return NextResponse.json({ error: "Complete seus dados na conta antes de vincular pedidos." }, { status: 409 });
    }

    let linked = 0;
    let rejected = 0;
    for (const claim of claims) {
      const tokenHash = createHash("sha256").update(claim.claimToken, "utf8").digest("hex");
      const { error } = await admin.rpc("claim_public_store_order_customer", {
        p_order: claim.orderId,
        p_customer: String(account.customer_id),
        p_token_hash: tokenHash,
      });
      if (error) {
        if (
          error.message.includes("STORE_ACCOUNT_CLAIM_PROOF_INVALID")
          || error.message.includes("STORE_ACCOUNT_ORDER_ALREADY_LINKED")
          || error.message.includes("STORE_ACCOUNT_ORDER_NOT_FOUND")
        ) {
          rejected += 1;
          continue;
        }
        throw error;
      }
      linked += 1;
    }

    const response = NextResponse.json({ linked, rejected });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[store-order-claim] falha ao vincular pedidos", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível vincular os pedidos agora." }, { status: 503 });
  }
}
