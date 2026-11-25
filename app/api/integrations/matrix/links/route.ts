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
  const applied = await supabase.rpc("matrix_apply_link_callback", {
    p_matrix_person_id: body.matrix_person_id,
    p_link_status: body.link_status,
    p_correlation_id: body.correlation_id,
  });
  if (applied.error) {
    console.error("[matrix-links] atomic callback failed", applied.error.code);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }
  if (applied.data?.outcome === "not_found") {
    return NextResponse.json({ error: "Vínculo pendente não encontrado." }, { status: 404 });
  }
  if (applied.data?.outcome === "state_conflict") {
    return NextResponse.json({ error: "Estado do vínculo incompatível." }, { status: 409 });
  }
  if (applied.data?.outcome !== "applied" || typeof applied.data.customer_linked !== "boolean") {
    return NextResponse.json({ error: "Confirmação de persistência indisponível." }, { status: 503 });
  }

  return NextResponse.json({
    accepted: true,
    matrix_person_id: body.matrix_person_id,
    link_status: body.link_status,
    customer_linked: applied.data.customer_linked,
    marketing_enabled: false,
    external_action_enabled: false,
  });
}
