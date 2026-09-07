import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const matrixApiUrl = process.env.ATTUAL_ONE_MATRIX_API_URL;
  const integrationSecret = process.env.ATTUAL_ONE_MATRIX_INTEGRATION_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !matrixApiUrl || !integrationSecret) {
    throw new Error("M4 Matrix bridge is not configured");
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    matrixApiUrl: matrixApiUrl.replace(/\/$/, ""),
    integrationSecret,
  };
}

async function accountContext(slug: string) {
  const config = getConfig();
  const auth = await createSupabaseServerClient();
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) return { unauthorized: true as const };

  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const company = await admin
    .from("companies")
    .select("id,slug")
    .eq("slug", slug)
    .eq("public_store_enabled", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (company.error) throw company.error;
  if (!company.data) return { notFound: true as const };

  let account = await admin
    .from("store_customer_accounts")
    .select("id,company_id,auth_user_id,customer_id")
    .eq("company_id", company.data.id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (account.error) throw account.error;
  if (!account.data) {
    account = await admin
      .from("store_customer_accounts")
      .insert({ company_id: company.data.id, auth_user_id: userData.user.id, email: userData.user.email ?? null })
      .select("id,company_id,auth_user_id,customer_id")
      .single();
    if (account.error || !account.data) throw account.error ?? new Error("account unavailable");
  }

  return { config, admin, company: company.data, account: account.data };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  try {
    const ctx = await accountContext(slug);
    if ("unauthorized" in ctx) return NextResponse.json({ authenticated: false }, { status: 401 });
    if ("notFound" in ctx) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

    const link = await ctx.admin
      .from("matrix_person_links")
      .select("matrix_person_id,status,linked_at,revoked_at,updated_at")
      .eq("store_account_id", ctx.account.id)
      .maybeSingle();
    if (link.error) throw link.error;
    return NextResponse.json({
      authenticated: true,
      matrix_link: link.data ?? null,
      marketing_enabled: false,
      external_action_enabled: false,
    });
  } catch (error) {
    console.error("[matrix-link] GET", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível consultar o vínculo Matrix." }, { status: 503 });
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  try {
    const ctx = await accountContext(slug);
    if ("unauthorized" in ctx) return NextResponse.json({ authenticated: false }, { status: 401 });
    if ("notFound" in ctx) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

    const correlationId = randomUUID();
    const response = await fetch(`${ctx.config.matrixApiUrl}/v1/internal/identity/bridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.config.integrationSecret}`,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        project_key: "attualplay",
        external_system: "attual_one",
        external_account_ref: ctx.account.id,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    const body = await response.json() as {
      bridge_code?: string;
      matrix_person_id?: string;
      expires_at?: string;
      error?: { message?: string };
    };
    if (!response.ok || !body.bridge_code || !body.matrix_person_id || !body.expires_at) {
      console.error("[matrix-link] Matrix bridge issue failed", response.status);
      return NextResponse.json({ error: "Não foi possível gerar o código de conexão agora." }, { status: 503 });
    }

    const persisted = await ctx.admin
      .from("matrix_person_links")
      .upsert({
        matrix_person_id: body.matrix_person_id,
        company_id: ctx.company.id,
        store_account_id: ctx.account.id,
        customer_id: ctx.account.customer_id ?? null,
        status: "pending",
        source: "explicit_user_bridge",
        linked_at: null,
        revoked_at: null,
        updated_at: new Date().toISOString(),
        last_correlation_id: correlationId,
      }, { onConflict: "matrix_person_id" });
    if (persisted.error) throw persisted.error;

    const audit = await ctx.admin.from("matrix_person_link_audit").insert({
      matrix_person_id: body.matrix_person_id,
      store_account_id: ctx.account.id,
      action: "bridge_requested",
      actor_type: "user",
      correlation_id: correlationId,
      metadata: {
        company_id: ctx.company.id,
        customer_linked: Boolean(ctx.account.customer_id),
        pii_sent_to_matrix: false,
        marketing_enabled: false,
      },
    });
    if (audit.error) throw audit.error;

    return NextResponse.json({
      bridge_code: body.bridge_code,
      expires_at: body.expires_at,
      status: "pending",
      instructions: "Digite este código no AttualPlay para concluir a conexão. O código é temporário e de uso único.",
      marketing_enabled: false,
      external_action_enabled: false,
    }, { status: 201 });
  } catch (error) {
    console.error("[matrix-link] POST", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível iniciar a conexão Matrix." }, { status: 503 });
  }
}
