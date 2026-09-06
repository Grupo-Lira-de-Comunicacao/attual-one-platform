import { NextResponse } from "next/server";
import { deliveryAdminClient, deliverySelect, toPublicDelivery, validDeliveryToken } from "@/lib/delivery-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validDeliveryToken(token)) return NextResponse.json({ error: "Rastreamento inválido." }, { status: 400 });

  try {
    const client = deliveryAdminClient();
    const { data, error } = await client
      .from("deliveries")
      .select(deliverySelect)
      .eq("public_tracking_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Entrega não encontrada." }, { status: 404 });

    const response = NextResponse.json({ tracking: toPublicDelivery(data as unknown as Record<string, unknown>) });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("[delivery-track]", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Rastreamento temporariamente indisponível." }, { status: 503 });
  }
}
