import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const matrixUrl = process.env.ATTUAL_ONE_MATRIX_URL;
  const secret = process.env.ATTUAL_ONE_MATRIX_INTEGRATION_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!matrixUrl || !secret || !supabaseUrl || !serviceKey) return NextResponse.json({ error: "Integração Matrix indisponível." }, { status: 503 });

  const auth = await createSupabaseServerClient();
  const user = await auth.auth.getUser();
  if (user.error || !user.data.user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const account = await admin.from("store_customer_accounts").select("id").eq("auth_user_id", user.data.user.id).limit(1).maybeSingle();
  if (account.error || !account.data) return NextResponse.json({ error: "Conta ATTUAL ONE não encontrada." }, { status: 404 });

  const response = await fetch(`${matrixUrl.replace(/\/$/, "")}/v1/internal/identity/bridge`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ project_key: "attualplay", external_system: "attual_one", external_account_ref: account.data.id }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: "Falha ao iniciar vínculo Matrix." }, { status: 502 });
  const matrixPersonId = String((payload as Record<string, unknown>).matrix_person_id ?? "");
  const correlationId = String((payload as Record<string, unknown>).correlation_id ?? "");
  const now = new Date().toISOString();
  const stored = await admin.from("matrix_person_links").upsert({ account_id: account.data.id, matrix_person_id: matrixPersonId, link_status: "pending", correlation_id: correlationId || null, updated_at: now }, { onConflict: "account_id,matrix_person_id" });
  if (stored.error) return NextResponse.json({ error: "Falha ao registrar vínculo Matrix." }, { status: 500 });
  return NextResponse.json({ bridge_code: (payload as Record<string, unknown>).bridge_code, expires_at: (payload as Record<string, unknown>).expires_at, correlation_id: correlationId });
}
