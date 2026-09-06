import { NextRequest, NextResponse } from "next/server";
import { deliveryAdminClient, deliverySelect, toDriverDelivery, validDeliveryToken } from "@/lib/delivery-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["assigned", "out_for_delivery", "delivered"]);

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validDeliveryToken(token)) return NextResponse.json({ error: "Acesso inválido." }, { status: 400 });
  try {
    const client = deliveryAdminClient();
    const { data, error } = await client.from("deliveries").select(deliverySelect).eq("driver_access_token", token).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Entrega não encontrada." }, { status: 404 });
    const response = NextResponse.json({ delivery: toDriverDelivery(data as unknown as Record<string, unknown>) });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("[delivery-driver:get]", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Entrega temporariamente indisponível." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validDeliveryToken(token)) return NextResponse.json({ error: "Acesso inválido." }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  try {
    const client = deliveryAdminClient();
    const { data: current, error: currentError } = await client
      .from("deliveries")
      .select("id,order_id,status,orders(status)")
      .eq("driver_access_token", token)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Entrega não encontrada." }, { status: 404 });

    if (body.location && typeof body.location === "object" && !Array.isArray(body.location)) {
      const location = body.location as Record<string, unknown>;
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      const accuracy = location.accuracy == null ? null : Number(location.accuracy);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000))) {
        return NextResponse.json({ error: "Localização inválida." }, { status: 400 });
      }
      if (["delivered", "cancelled"].includes(String(current.status))) return NextResponse.json({ error: "Esta entrega já foi encerrada." }, { status: 409 });
      const { error } = await client.from("deliveries").update({
        current_lat: lat,
        current_lng: lng,
        accuracy_m: accuracy,
        last_location_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", current.id);
      if (error) throw error;
    }

    if (typeof body.status === "string") {
      if (!allowedStatuses.has(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      const order = (Array.isArray(current.orders) ? current.orders[0] : current.orders) as { status?: string } | null;
      const now = new Date().toISOString();

      if (body.status === "assigned") {
        const driverName = typeof body.driverName === "string" ? body.driverName.trim().slice(0, 120) : "";
        const driverPhone = typeof body.driverPhone === "string" ? body.driverPhone.trim().slice(0, 40) : "";
        const { error } = await client.from("deliveries").update({
          status: "assigned",
          driver_name: driverName || null,
          driver_phone: driverPhone || null,
          assigned_at: now,
          updated_at: now,
        }).eq("id", current.id).not("status", "in", "(delivered,cancelled)");
        if (error) throw error;
      }

      if (body.status === "out_for_delivery") {
        if (!["ready", "out_for_delivery"].includes(order?.status ?? "")) {
          return NextResponse.json({ error: "O pedido precisa estar pronto antes de sair para entrega." }, { status: 409 });
        }
        const { error: deliveryError } = await client.from("deliveries").update({ status: "out_for_delivery", started_at: now, updated_at: now }).eq("id", current.id);
        if (deliveryError) throw deliveryError;
        const { error: orderError } = await client.from("orders").update({ status: "out_for_delivery", updated_at: now }).eq("id", current.order_id);
        if (orderError) throw orderError;
      }

      if (body.status === "delivered") {
        if (String(current.status) !== "out_for_delivery") return NextResponse.json({ error: "A entrega precisa estar em rota." }, { status: 409 });
        const { error: deliveryError } = await client.from("deliveries").update({ status: "delivered", delivered_at: now, updated_at: now }).eq("id", current.id);
        if (deliveryError) throw deliveryError;
        const { error: orderError } = await client.from("orders").update({ status: "completed", updated_at: now }).eq("id", current.order_id);
        if (orderError) throw orderError;
      }
    }

    const { data, error } = await client.from("deliveries").select(deliverySelect).eq("id", current.id).single();
    if (error) throw error;
    return NextResponse.json({ delivery: toDriverDelivery(data as unknown as Record<string, unknown>) });
  } catch (error) {
    console.error("[delivery-driver:patch]", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Não foi possível atualizar a entrega." }, { status: 503 });
  }
}
