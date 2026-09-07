import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LinkCallback = {
  matrix_person_id: string;
  link_status: "linked" | "revoked";
  correlation_id: string;
};

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.ATTUAL_ONE_MATRIX_INTEGRATION_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !secret) throw new Error("Matrix link callback not configured");
  return { supabaseUrl, serviceRoleKey, secret };
}

function parse(value: unknown): LinkCallback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Partial<LinkCallback>;
  if (!body.matrix_person_id || !UUID.test(body.matrix_person_id)) return null;
  if (body.link_status !== "linked" && body.link_status !== "revoked") return null;
  if (!body.correlation_id || !UUID.test(body.correlation_id)) return null;
  return body as LinkCallback;
}

export async function POST(request: NextRequest) {
  let cfg: ReturnType<typeof config>;
  try { cfg = config(); } catch {
    return NextResponse.json({ error: "Integração Matrix indisponível." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!bearer || bearer !== cfg.secret) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const body = parse(raw);
  if (!body) return NextResponse.json({ error: "Callback Matrix inválido." }, { status: 422 });

  const supabase = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existing = await supabase
    .from("matrix_person_links")
    .select("id,store_account_id,customer_id,status")
    .eq("matrix_person_id", body.matrix_person_id)
    .maybeSingle();
  if (existing.error) {
    console.error("[matrix-links] lookup failed", existing.error);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }
  if (!existing.data) return NextResponse.json({ error: "Vínculo pendente não encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  const update = body.link_status === "linked"
    ? { status: "linked", linked_at: now, revoked_at: null, updated_at: now, last_correlation_id: body.correlation_id }
    : { status: "revoked", revoked_at: now, updated_at: now, last_correlation_id: body.correlation_id };
  const changed = await supabase.from("matrix_person_links").update(update).eq("id", existing.data.id);
  if (changed.error) {
    console.error("[matrix-links] update failed", changed.error);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  if (body.link_status === "linked" && existing.data.customer_id) {
    const inbox = await supabase
      .from("matrix_signal_inbox")
      .update({ processing_status: "linked", linked_customer_id: existing.data.customer_id, updated_at: now })
      .eq("matrix_person_id", body.matrix_person_id)
      .in("processing_status", ["received", "unlinked"]);
    if (inbox.error) console.error("[matrix-links] inbox link update", inbox.error);
  }

  if (body.link_status === "revoked") {
    const inbox = await supabase
      .from("matrix_signal_inbox")
      .update({ processing_status: "suppressed", linked_customer_id: null, updated_at: now })
      .eq("matrix_person_id", body.matrix_person_id)
      .in("processing_status", ["received", "unlinked", "linked"]);
    if (inbox.error) console.error("[matrix-links] inbox suppression update", inbox.error);
  }

  const audit = await supabase.from("matrix_person_link_audit").insert({
    matrix_person_id: body.matrix_person_id,
    store_account_id: existing.data.store_account_id,
    action: body.link_status,
    actor_type: "matrix",
    correlation_id: body.correlation_id,
    metadata: {
      customer_linked: Boolean(existing.data.customer_id),
      marketing_enabled: false,
      external_action_enabled: false,
    },
  });
  if (audit.error) console.error("[matrix-links] audit failed", audit.error);

  return NextResponse.json({
    accepted: true,
    matrix_person_id: body.matrix_person_id,
    link_status: body.link_status,
    customer_linked: body.link_status === "linked" && Boolean(existing.data.customer_id),
    marketing_enabled: false,
    external_action_enabled: false,
  });
}
