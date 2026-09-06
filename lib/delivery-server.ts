import { createClient } from "@supabase/supabase-js";
import type { DriverDelivery, PublicDeliveryTracking } from "@/lib/delivery-types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validDeliveryToken(token: string) {
  return uuidPattern.test(token);
}

export function deliveryAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Delivery service not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function addressRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function toPublicDelivery(row: Record<string, unknown>): PublicDeliveryTracking {
  const order = (Array.isArray(row.orders) ? row.orders[0] : row.orders) as Record<string, unknown> | null;
  const company = (Array.isArray(row.companies) ? row.companies[0] : row.companies) as Record<string, unknown> | null;
  const address = addressRecord(order?.delivery_address);
  const lat = typeof row.current_lat === "number" ? row.current_lat : null;
  const lng = typeof row.current_lng === "number" ? row.current_lng : null;
  const location = lat !== null && lng !== null && row.last_location_at
    ? {
        lat,
        lng,
        accuracy: typeof row.accuracy_m === "number" ? row.accuracy_m : undefined,
        updatedAt: String(row.last_location_at),
      }
    : undefined;

  return {
    orderNumber: Number(order?.number ?? 0),
    orderStatus: String(order?.status ?? "new"),
    deliveryStatus: String(row.status ?? "pending") as PublicDeliveryTracking["deliveryStatus"],
    storeName: String(company?.name ?? "Estabelecimento"),
    storeSlug: String(company?.slug ?? ""),
    driverName: typeof row.driver_name === "string" && row.driver_name ? row.driver_name : undefined,
    currentLocation: location,
    destination: order?.delivery_address ? {
      street: typeof address.street === "string" ? address.street : undefined,
      number: typeof address.number === "string" ? address.number : undefined,
      district: typeof address.district === "string" ? address.district : undefined,
      city: typeof address.city === "string" ? address.city : undefined,
    } : undefined,
    updatedAt: String(row.updated_at ?? order?.updated_at ?? new Date().toISOString()),
  };
}

export function toDriverDelivery(row: Record<string, unknown>): DriverDelivery {
  const order = (Array.isArray(row.orders) ? row.orders[0] : row.orders) as Record<string, unknown> | null;
  return {
    ...toPublicDelivery(row),
    customerName: String(order?.customer_name ?? "Cliente"),
    customerPhone: typeof order?.customer_phone === "string" && order.customer_phone ? order.customer_phone : undefined,
    driverPhone: typeof row.driver_phone === "string" && row.driver_phone ? row.driver_phone : undefined,
    driverToken: String(row.driver_access_token),
    requiresAgeDocument: Boolean(order?.contains_age_restricted_product),
    ageHandoffStatus: typeof order?.age_handoff_status === "string" ? order.age_handoff_status as DriverDelivery["ageHandoffStatus"] : undefined,
  };
}

export const deliverySelect = [
  "id","company_id","order_id","status","driver_name","driver_phone",
  "public_tracking_token","driver_access_token","current_lat","current_lng","accuracy_m",
  "last_location_at","assigned_at","started_at","delivered_at","updated_at",
  "orders(number,status,customer_name,customer_phone,delivery_address,contains_age_restricted_product,age_handoff_status,updated_at)",
  "companies(name,slug)",
].join(",");
