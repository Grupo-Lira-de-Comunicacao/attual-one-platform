import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatrixSignal = {
  signal_key: string;
  matrix_person_id: string;
  topic_key: string;
  score: number;
  confidence: number;
  signal_count: number;
  policy_version: string;
  purpose: "personalization";
  marketing_allowed: false;
  external_action_allowed: false;
  source_system: "matrix-attual";
  target_system: "attual-one";
  occurred_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[A-Za-z0-9_.:-]{8,200}$/;
const TOPIC = /^[a-z0-9][a-z0-9-]{1,79}$/;

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.ATTUAL_ONE_MATRIX_INTEGRATION_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !secret) {
    throw new Error("Matrix integration is not configured in ATTUAL ONE");
  }
  return { supabaseUrl, serviceRoleKey, secret };
}

function isSignal(value: unknown): value is MatrixSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const signal = value as Partial<MatrixSignal>;
  return (
    typeof signal.signal_key === "string" && SAFE_KEY.test(signal.signal_key) &&
    typeof signal.matrix_person_id === "string" && UUID.test(signal.matrix_person_id) &&
    typeof signal.topic_key === "string" && TOPIC.test(signal.topic_key) &&
    typeof signal.score === "number" && Number.isFinite(signal.score) && signal.score >= 0 &&
    typeof signal.confidence === "number" && Number.isFinite(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 1 &&
    Number.isInteger(signal.signal_count) && Number(signal.signal_count) > 0 &&
    typeof signal.policy_version === "string" && signal.policy_version.length >= 3 && signal.policy_version.length <= 80 &&
    signal.purpose === "personalization" &&
    signal.marketing_allowed === false &&
    signal.external_action_allowed === false &&
    signal.source_system === "matrix-attual" &&
    signal.target_system === "attual-one" &&
    typeof signal.occurred_at === "string" && !Number.isNaN(Date.parse(signal.occurred_at))
  );
}

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    console.error("[matrix-signals] incomplete configuration", error);
    return NextResponse.json({ error: "Integração Matrix indisponível." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!bearer || bearer !== config.secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !SAFE_KEY.test(idempotencyKey)) {
    return NextResponse.json({ error: "Idempotency-Key obrigatório." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isSignal(body) || body.signal_key !== idempotencyKey) {
    return NextResponse.json({ error: "Sinal Matrix inválido ou chave de idempotência divergente." }, { status: 422 });
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await supabase
    .from("matrix_signal_inbox")
    .select("id,signal_key,received_at,processing_status")
    .eq("signal_key", body.signal_key)
    .maybeSingle();

  if (existing.error) {
    console.error("[matrix-signals] idempotency read failed", existing.error);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  if (existing.data) {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      signal_key: existing.data.signal_key,
      processing_status: existing.data.processing_status,
      received_at: existing.data.received_at,
    });
  }

  const link = await supabase
    .from("matrix_person_links")
    .select("status,customer_id")
    .eq("matrix_person_id", body.matrix_person_id)
    .maybeSingle();
  if (link.error) {
    console.error("[matrix-signals] explicit link lookup failed", link.error);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  const linkedCustomerId = link.data?.status === "linked" && link.data.customer_id ? String(link.data.customer_id) : null;
  const processingStatus = link.data?.status === "revoked" || link.data?.status === "suppressed"
    ? "suppressed"
    : linkedCustomerId
      ? "linked"
      : "unlinked";

  const inserted = await supabase
    .from("matrix_signal_inbox")
    .insert({
      signal_key: body.signal_key,
      matrix_person_id: body.matrix_person_id,
      topic_key: body.topic_key,
      score: body.score,
      confidence: body.confidence,
      signal_count: body.signal_count,
      policy_version: body.policy_version,
      purpose: "personalization",
      marketing_allowed: false,
      external_action_allowed: false,
      source_system: "matrix-attual",
      target_system: "attual-one",
      occurred_at: body.occurred_at,
      processing_status: processingStatus,
      linked_customer_id: linkedCustomerId,
      payload: {
        topic_key: body.topic_key,
        score: body.score,
        confidence: body.confidence,
        signal_count: body.signal_count,
        policy_version: body.policy_version,
      },
    })
    .select("id,received_at,processing_status,linked_customer_id")
    .single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      return NextResponse.json({ accepted: true, duplicate: true, signal_key: body.signal_key });
    }
    console.error("[matrix-signals] insert failed", inserted.error);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  return NextResponse.json({
    accepted: true,
    duplicate: false,
    signal_key: body.signal_key,
    processing_status: inserted.data.processing_status,
    received_at: inserted.data.received_at,
    linked_customer: Boolean(inserted.data.linked_customer_id),
    marketing_enabled: false,
    external_action_enabled: false,
  }, { status: 201 });
}
