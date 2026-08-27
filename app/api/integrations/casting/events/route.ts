import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  isCastingEventType,
  payloadHash,
  resolveCastingState,
  stateForEvent,
  type CastingEventType,
  type CastingState,
  verifyCastingSignature,
} from "@/lib/integrations/casting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CastingEvent = {
  event_id: string;
  event_key: string;
  event_type: CastingEventType;
  event_version: number;
  source_system: string;
  target_system: string;
  organization_external_id: string | null;
  project_external_id: string | null;
  talent_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
};

type CastingContext = {
  productionId: string;
  castingCallId: string;
  shortlistId: string;
  invitationId: string;
  talentId: string;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const integrationSecret = process.env.ATTUAL_ONE_INTEGRATION_SECRET;
  const previousSecret = process.env.ATTUAL_ONE_PREVIOUS_INTEGRATION_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !integrationSecret) {
    throw new Error("Integração Casting 360 não configurada no ATTUAL ONE.");
  }

  return { supabaseUrl, serviceRoleKey, integrationSecret, previousSecret };
}

function stringField(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventContext(event: CastingEvent): CastingContext | null {
  const payload = event.payload;
  const productionId = stringField(payload.production_id);
  const castingCallId = stringField(payload.casting_call_id);
  const shortlistId = stringField(payload.shortlist_id);
  const invitationId = stringField(payload.invitation_id);
  const talentId = stringField(payload.talent_id) ?? stringField(event.talent_id);

  if (!productionId || !castingCallId || !shortlistId || !invitationId || !talentId) return null;
  return { productionId, castingCallId, shortlistId, invitationId, talentId };
}

function isValidEvent(value: unknown): value is CastingEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CastingEvent>;

  return (
    typeof event.event_id === "string" &&
    typeof event.event_key === "string" &&
    typeof event.event_type === "string" &&
    isCastingEventType(event.event_type) &&
    event.event_version === 1 &&
    event.source_system === "casting-attual-360" &&
    event.target_system === "attual-one" &&
    typeof event.occurred_at === "string" &&
    !Number.isNaN(Date.parse(event.occurred_at)) &&
    !!event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
  );
}

function timestampPatch(state: CastingState, occurredAt: string) {
  if (state === "prepared") return { prepared_at: occurredAt };
  if (state === "linked") return { telegram_linked_at: occurredAt };
  if (state === "sent") return { sent_at: occurredAt };
  return { responded_at: occurredAt };
}

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    console.error("[casting-events] configuração incompleta", error);
    return NextResponse.json({ error: "Integração indisponível." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const acceptedSecret = [config.integrationSecret, config.previousSecret].find(
    (secret) => secret && secret === bearer,
  );
  if (!acceptedSecret) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const idempotencyKey = request.headers.get("idempotency-key");
  const timestamp = request.headers.get("x-attual-timestamp");
  const signature = request.headers.get("x-attual-signature");
  const rawBody = await request.text();

  if (!idempotencyKey || !timestamp || !signature) {
    return NextResponse.json({ error: "Assinatura obrigatória." }, { status: 401 });
  }

  if (!verifyCastingSignature({
    body: rawBody,
    eventKey: idempotencyKey,
    path: request.nextUrl.pathname,
    secret: acceptedSecret,
    signature,
    timestamp,
  })) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isValidEvent(event) || event.event_key !== idempotencyKey) {
    return NextResponse.json(
      { error: "Evento inválido ou chave de idempotência divergente." },
      { status: 422 },
    );
  }

  const context = eventContext(event);
  if (!context) return NextResponse.json({ error: "Contexto obrigatório incompleto." }, { status: 422 });

  const hash = payloadHash(event);
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await supabase
    .from("casting_integration_events")
    .select("id,event_key,received_at,processing_status,payload_hash,payload")
    .eq("event_key", event.event_key)
    .maybeSingle();

  if (existingError) {
    console.error("[casting-events] falha ao verificar idempotência", existingError);
    return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
  }

  if (existing && existing.payload_hash && existing.payload_hash !== hash) {
    console.warn("[casting-events] colisão de idempotência", { event_key: event.event_key });
    return NextResponse.json({ error: "Conflito de idempotência." }, { status: 409 });
  }

  if (existing?.processing_status === "processed") {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      event_key: existing.event_key,
      received_at: existing.received_at,
    });
  }

  let inboxId = existing?.id as string | undefined;
  if (!inboxId) {
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
        payload_hash: hash,
        processing_status: "processing",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        return NextResponse.json({ accepted: true, duplicate: true, event_key: event.event_key });
      }
      console.error("[casting-events] falha ao persistir evento", insertError);
      return NextResponse.json({ error: "Falha de persistência." }, { status: 500 });
    }
    inboxId = inserted.id;
  } else {
    await supabase
      .from("casting_integration_events")
      .update({ processing_status: "processing", processing_error: null, payload_hash: hash })
      .eq("id", inboxId);
  }

  const incomingState = stateForEvent(event.event_type);
  const { data: projection, error: projectionReadError } = await supabase
    .from("casting_invitation_projections")
    .select("state")
    .eq("invitation_id", context.invitationId)
    .maybeSingle();

  if (projectionReadError) {
    await supabase
      .from("casting_integration_events")
      .update({ processing_status: "failed", processing_error: projectionReadError.message })
      .eq("id", inboxId);
    return NextResponse.json({ error: "Falha ao aplicar projeção." }, { status: 500 });
  }

  const resolved = resolveCastingState((projection?.state as CastingState | null) ?? null, incomingState);
  const responseStatus =
    resolved.state === "accepted" || resolved.state === "declined" ? resolved.state : "pending";

  const { error: projectionError } = await supabase.from("casting_invitation_projections").upsert(
    {
      invitation_id: context.invitationId,
      production_id: context.productionId,
      casting_call_id: context.castingCallId,
      shortlist_id: context.shortlistId,
      talent_id: context.talentId,
      state: resolved.state,
      response_status: responseStatus,
      last_event_key: event.event_key,
      last_event_type: event.event_type,
      final_state_conflict: resolved.conflict,
      updated_at: new Date().toISOString(),
      ...timestampPatch(incomingState, event.occurred_at),
    },
    { onConflict: "invitation_id" },
  );

  if (projectionError) {
    await supabase
      .from("casting_integration_events")
      .update({ processing_status: "failed", processing_error: projectionError.message })
      .eq("id", inboxId);
    return NextResponse.json({ error: "Falha ao aplicar projeção." }, { status: 500 });
  }

  await supabase
    .from("casting_integration_events")
    .update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      processing_error: resolved.conflict ? "final_state_conflict" : null,
      state_conflict: resolved.conflict,
    })
    .eq("id", inboxId);

  return NextResponse.json(
    {
      accepted: true,
      duplicate: false,
      event_key: event.event_key,
      state: resolved.state,
      conflict: resolved.conflict,
    },
    { status: 201 },
  );
}
