import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.ATTUAL_ONE_MATRIX_INTEGRATION_SECRET;
  if (!url || !key || !secret) throw new Error("Matrix integration unavailable");
  return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), secret };
}

export async function POST(request: NextRequest) {
  let cfg: ReturnType<typeof config>;
  try { cfg = config(); } catch { return NextResponse.json({ error: "Integração Matrix indisponível." }, { status: 503 }); }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || auth.slice(7) !== cfg.secret) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const matrixPersonId = String(body.matrix_person_id ?? "");
  const linkStatus = String(body.link_status ?? "");
  const correlationId = String(body.correlation_id ?? "");
  if (!UUID.test(matrixPersonId) || !["linked", "revoked"].includes(linkStatus) || !UUID.test(correlationId)) {
    return NextResponse.json({ error: "Callback Matrix inválido." }, { status: 422 });
  }

  const current = await cfg.db.from("matrix_person_links").select("id,account_id,link_status").eq("matrix_person_id", matrixPersonId).maybeSingle();
  if (current.error) return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  if (!current.data) return NextResponse.json({ accepted: true, linked: false, status: "unmatched" });

  const now = new Date().toISOString();
  const update = linkStatus === "linked"
    ? { link_status: "linked", linked_at: now, revoked_at: null, correlation_id: correlationId, updated_at: now }
    : { link_status: "revoked", revoked_at: now, correlation_id: correlationId, updated_at: now };
  const saved = await cfg.db.from("matrix_person_links").update(update).eq("id", current.data.id);
  if (saved.error) return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  return NextResponse.json({ accepted: true, linked: linkStatus === "linked", status: linkStatus, marketing_enabled: false, external_action_enabled: false });
}
