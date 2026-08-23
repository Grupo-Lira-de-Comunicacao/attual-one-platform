import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CastingEvent = {
  event_id: string;
  event_key: string;
  event_type: string;
  event_version: number;
  source_system: string;
  target_system: string;
  organization_external_id: string | null;
  project_external_id: string | null;
  talent_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const integrationSecret = process.env.ATTUAL_ONE_INTEGRATION_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !integrationSecret) {
    throw new Error("Integração Casting 360 não configurada no ATTUAL ONE.");
  }

  return { supabaseUrl, serviceRoleKey, integrationSecret };
}

function isValidEvent(value: unknown): value is CastingEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CastingEvent>;

  return (
    typeof event.event_id === "string" &&
    typeof event.event_key === "string" &&
    typeof event.event_type === "string" &&
    typeof event.event_version === "number" &&
    event.source_system === "casting-attual-360" &&
    event.target_system === "attual-one" &&
    typeof event.occurred_at === "string" &&
    !!event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
  );
}

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof getConfig>;

  try {
    config = getConfig();
  } catch (error) {
    console.error("[casting-events] configuração incompleta", error);
    return NextResponse.json(
      { error: "Integração indisponível." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${config.integrationSecret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "Cabeçalho idempotency-key obrigatório." },
      { status: 400 },
    );
  }

  let event: unknown;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isValidEvent(event) || event.event_key !== idempotencyKey) {
    return NextResponse.json(
      { error: "Evento inválido ou chave de idempotência divergente." },
      { status: 422 },
    );
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await supabase
    .from("casting_integration_events")
    .select("id,event_key,received_at")
    .eq("event_key", event.event_key)
    .maybeSingle();

  if (existingError) {
    console.error("[casting-events] falha ao verificar idempotência", existingError);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      event_key: existing.event_key,
      received_at: existing.received_at,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("casting_integration_events")
    .insert({
      source_event_id: event.event_id,
      event_key: event.event_key,
      event_type: event.event_type,
      event_version: event.event_version,
      source_system: event.source_system,
      target_system: event.target_system,
      organization_external_id: event.organization_external_id,
      project_external_id: event.project_external_id,
      talent_id: event.talent_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
    })
    .select("id,event_key,received_at")
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return NextResponse.json({
        accepted: true,
        duplicate: true,
        event_key: event.event_key,
      });
    }

    console.error("[casting-events] falha ao persistir evento", insertError);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  return NextResponse.json(
    {
      accepted: true,
      duplicate: false,
      event_key: inserted.event_key,
      received_at: inserted.received_at,
    },
    { status: 201 },
  );
}
