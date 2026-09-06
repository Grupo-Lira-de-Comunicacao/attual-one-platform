import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PublicCheckoutInput,
  PublicCheckoutResult,
  PublicStorePayload,
} from "@/lib/public-storefront-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fulfillmentValues = new Set(["pickup", "delivery", "dine_in"]);
const paymentValues = new Set(["pix", "cash", "credit_card", "debit_card"]);

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase público não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Checkout público não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(profile: Record<string, unknown>, key: string, fallback: string) { const value = profile[key]; return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function bool(profile: Record<string, unknown>, key: string, fallback = false) { const value = profile[key]; if (typeof value === "boolean") return value; if (typeof value === "string") return value.toLowerCase() === "true"; return fallback; }
function numberValue(profile: Record<string, unknown>, key: string, fallback = 0) { const value = profile[key]; if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function logoText(name: string, profile: Record<string, unknown>) { const configured = profile.logo_text; if (typeof configured === "string" && configured.trim()) return configured.trim().slice(0, 4).toUpperCase(); return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => (/^\d+$/.test(part) ? part.slice(-1) : part.slice(0, 1))).join("").toUpperCase() || "AO"; }
function apiError(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

function safeCheckoutMessage(message: string) {
  const known: Array<[string, string]> = [
    ["PUBLIC_STORE_NOT_FOUND", "Loja não encontrada ou indisponível."],
    ["PUBLIC_STORE_CLOSED", "A loja está fechada e não está recebendo pedidos agora."],
    ["PUBLIC_STORE_EMPTY_CART", "Seu carrinho está vazio."],
    ["PUBLIC_STORE_INVALID_ITEM", "Um dos itens do carrinho é inválido."],
    ["PUBLIC_STORE_INVALID_PIZZA", "Revise o tamanho e os sabores da pizza."],
    ["PUBLIC_STORE_PRODUCT_UNAVAILABLE", "Um dos produtos ficou indisponível. Atualize o cardápio."],
    ["PUBLIC_STORE_STOCK", "A quantidade solicitada não está mais disponível."],
    ["PUBLIC_STORE_COUPON", "Cupom inválido ou indisponível."],
    ["PUBLIC_STORE_ADDRESS", "Informe rua, número e bairro para a entrega."],
  ];
  return known.find(([code]) => message.includes(code))?.[1] ?? "Não foi possível concluir o pedido.";
}

function localDateInfo(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value("weekday") as "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun"] ?? 0;
  return { weekday, date: `${value("year")}-${value("month")}-${value("day")}` };
}

function promotionPrice(profile: Record<string, unknown>, sku: string | null, timeZone: string): number | undefined {
  if (!sku) return undefined;
  const promotion = asRecord(profile.weekly_promotion);
  const price = Number(promotion.price_cents);
  const weekdays = Array.isArray(promotion.weekdays) ? promotion.weekdays.map(Number) : [];
  const eligible = Array.isArray(promotion.eligible_skus) ? promotion.eligible_skus.filter((value): value is string => typeof value === "string") : [];
  const excluded = Array.isArray(promotion.excluded_dates) ? promotion.excluded_dates.filter((value): value is string => typeof value === "string") : [];
  if (!Number.isFinite(price) || price < 0 || !eligible.includes(sku)) return undefined;
  const now = localDateInfo(timeZone);
  if (!weekdays.includes(now.weekday) || excluded.includes(now.date)) return undefined;
  return price / 100;
}

function pizzaParts(name: string, sku: string | null, isPizza: boolean) {
  if (!isPizza) return {};
  const match = name.match(/^(.*?)\s+-\s+(Grande|M[eé]dia|Pequena|Broto|Fam[ií]lia)$/i);
  if (match) {
    const rawSize = match[2];
    const size = /^media$/i.test(rawSize) ? "Média" : /^familia$/i.test(rawSize) ? "Família" : rawSize.charAt(0).toUpperCase()+rawSize.slice(1).toLowerCase();
    return { pizzaFlavor: match[1].trim(), pizzaSize: size };
  }
  if (sku?.endsWith("-G")) return { pizzaFlavor: name.replace(/\s+-\s+Grande$/i, "").trim(), pizzaSize: "Grande" };
  if (sku?.endsWith("-M")) return { pizzaFlavor: name.replace(/\s+-\s+M[eé]dia$/i, "").trim(), pizzaSize: "Média" };
  return { pizzaFlavor: name };
}

async function loadStore(client: SupabaseClient, slug: string): Promise<PublicStorePayload | null> {
  const { data: company, error: companyError } = await client.from("companies").select("id,name,slug,public_store_enabled,public_store_open,public_profile,timezone").eq("slug", slug).eq("public_store_enabled", true).is("deleted_at", null).maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) return null;

  const [categoriesResult, productsResult, zonesResult] = await Promise.all([
    client.from("categories").select("id,name,description,display_order").eq("company_id", company.id).eq("status", "active").is("deleted_at", null).order("display_order", { ascending: true }),
    client.from("products").select("id,category_id,name,description,price_cents,promotional_price_cents,image_url,sku,track_stock,current_stock,status").eq("company_id", company.id).eq("is_public", true).in("status", ["available", "out_of_stock"]).is("deleted_at", null).order("name", { ascending: true }),
    client.from("delivery_zones").select("id,name,fee_cents,distance_band,is_default,display_order").eq("company_id", company.id).eq("active", true).order("display_order", { ascending: true }),
  ]);
  const readError = categoriesResult.error ?? productsResult.error ?? zonesResult.error;
  if (readError) throw new Error(readError.message);
  const categories = categoriesResult.data ?? [];
  const products = productsResult.data ?? [];
  const zones = zonesResult.data ?? [];
  const profile = asRecord(company.public_profile);
  const description = text(profile, "description", "Loja online");
  const deliveryFeeCents = numberValue(profile, "delivery_fee_cents", 0);
  const alcoholCategoryIds = new Set(categories.filter((row) => row.name.toLowerCase().includes("cerveja") || row.name.toLowerCase().includes("alco")).map((row) => row.id));
  const pizzaCategoryIds = new Set(categories.filter((row) => row.name.toLocaleLowerCase("pt-BR").includes("pizza")).map((row) => row.id));
  const halfRule = text(profile, "pizza_half_price_rule", "highest");

  return {
    config: {
      companyId: company.id, slug: company.slug, name: company.name,
      tagline: text(profile, "tagline", description), logoText: logoText(company.name, profile),
      logoUrl: text(profile, "logo_url", "") || undefined, primaryColor: text(profile, "primary_color", "") || undefined,
      secondaryColor: text(profile, "secondary_color", "") || undefined, coverMessage: text(profile, "cover_message", description),
      promotionNote: text(profile, "promotion_note", "") || undefined, open: Boolean(company.public_store_open),
      acceptOrdersWhenClosed: bool(profile, "accept_orders_when_closed", false), openingHours: text(profile, "opening_hours", "Consulte os horários com o estabelecimento"),
      closedMessage: text(profile, "closed_message", "Estamos fechados agora. Volte no próximo horário!"), deliveryFee: Math.max(0, deliveryFeeCents) / 100,
      city: text(profile, "city", ""), state: text(profile, "state", ""), alcoholMinAge: Math.max(0, numberValue(profile, "alcohol_min_age", 0)) || undefined,
      pizzaConfiguratorEnabled: bool(profile, "pizza_configurator_enabled", false),
      pizzaHalfPriceRule: halfRule === "highest" ? "highest" : undefined,
    },
    categories: categories.map((row) => ({ id: row.id, name: row.name, description: row.description, displayOrder: row.display_order })),
    products: products.map((row) => {
      const isPizza = pizzaCategoryIds.has(row.category_id);
      const parts = pizzaParts(row.name, row.sku, isPizza);
      return {
        id: row.id, categoryId: row.category_id, name: row.name, description: row.description, price: row.price_cents / 100,
        promotionalPrice: promotionPrice(profile, row.sku, company.timezone ?? "America/Sao_Paulo") ?? (row.promotional_price_cents == null ? undefined : row.promotional_price_cents / 100),
        imageUrl: row.image_url ?? undefined, sku: row.sku ?? undefined, trackStock: Boolean(row.track_stock), currentStock: Number(row.current_stock), status: row.status,
        requiresAgeVerification: alcoholCategoryIds.has(row.category_id), isPizza, ...parts,
      };
    }),
    deliveryZones: zones.map((row) => ({ id: row.id, name: row.name, fee: Number(row.fee_cents) / 100, distanceBand: row.distance_band ?? undefined, isDefault: Boolean(row.is_default) })),
  };
}

function parseCheckout(value: unknown): PublicCheckoutInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Partial<PublicCheckoutInput>;
  if (typeof body.submissionId !== "string" || body.submissionId.trim().length < 8 || body.submissionId.length > 128) return null;
  if (typeof body.identified !== "boolean") return null;
  if (typeof body.fulfillment !== "string" || !fulfillmentValues.has(body.fulfillment)) return null;
  if (typeof body.paymentMethod !== "string" || !paymentValues.has(body.paymentMethod)) return null;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return null;
  if (body.identified && (typeof body.name !== "string" || !body.name.trim() || typeof body.phone !== "string" || !body.phone.trim())) return null;
  if (body.fulfillment === "delivery") {
    const address = asRecord(body.address);
    if (typeof address.street !== "string" || !address.street.trim() || typeof address.number !== "string" || !address.number.trim() || typeof address.district !== "string" || !address.district.trim()) return null;
  }
  for (const item of body.items) {
    if (!item || typeof item !== "object") return null;
    if (typeof item.productId !== "string" || !uuidPattern.test(item.productId)) return null;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return null;
    if (item.additions && (!Array.isArray(item.additions) || item.additions.length > 20 || item.additions.some((x) => typeof x !== "string" || x.length > 120))) return null;
    if (item.note != null && (typeof item.note !== "string" || item.note.length > 500)) return null;
    if (item.configuration != null) {
      const config = asRecord(item.configuration);
      if (config.kind !== "pizza" || (config.mode !== "whole" && config.mode !== "half") || typeof config.size !== "string" || !config.size.trim() || config.size.length > 40) return null;
      if (config.mode === "half" && (typeof config.secondProductId !== "string" || !uuidPattern.test(config.secondProductId))) return null;
      if (config.mode === "whole" && config.secondProductId != null) return null;
    }
  }
  return body as PublicCheckoutInput;
}

async function authenticatedCustomer(client: ReturnType<typeof adminClient>, slug: string) {
  const auth = await createSupabaseServerClient();
  const { data: userData } = await auth.auth.getUser();
  if (!userData.user) return null;
  const { data: company } = await client.from("companies").select("id").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!company?.id) return null;
  const { data: account } = await client.from("store_customer_accounts").select("customer_id").eq("company_id", company.id).eq("auth_user_id", userData.user.id).maybeSingle();
  if (!account?.customer_id) return null;
  return { companyId: String(company.id), customerId: String(account.customer_id) };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return apiError("Loja inválida.", 400);
  try {
    const store = await loadStore(publicClient(), slug);
    if (!store) return apiError("Loja não encontrada.", 404);
    const response = NextResponse.json(store);
    response.headers.set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
    return response;
  } catch (error) {
    console.error("[public-storefront] falha ao carregar loja", error instanceof Error ? error.message : "erro desconhecido");
    return apiError("Loja temporariamente indisponível.", 503);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return apiError("Loja inválida.", 400);
  let payload: PublicCheckoutInput | null = null;
  try { payload = parseCheckout(await request.json()); } catch { return apiError("Dados de checkout inválidos.", 400); }
  if (!payload) return apiError("Dados de checkout inválidos.", 400);

  try {
    const client = adminClient();
    const couponCode = payload.couponCode?.trim().toUpperCase() || "";
    let customerContext = await authenticatedCustomer(client, slug);

    if (couponCode) {
      const { data: company } = await client.from("companies").select("id").eq("slug", slug).is("deleted_at", null).maybeSingle();
      if (!company?.id) return apiError("Loja não encontrada.", 404);
      const { data: coupon } = await client.from("coupons").select("id").eq("company_id", company.id).eq("code", couponCode).is("deleted_at", null).maybeSingle();
      if (coupon?.id) {
        const { count: privateCount, error: privateError } = await client
          .from("store_customer_coupon_entitlements")
          .select("id", { count:"exact", head:true })
          .eq("company_id", company.id)
          .eq("coupon_id", coupon.id);
        if (privateError) throw privateError;
        if ((privateCount ?? 0) > 0) {
          if (!customerContext || customerContext.companyId !== String(company.id)) return apiError("Este cupom pertence a uma conta de cliente. Entre na sua conta para usá-lo.", 409);
          const { data: entitlement, error: entitlementError } = await client
            .from("store_customer_coupon_entitlements")
            .select("id")
            .eq("company_id", company.id)
            .eq("customer_id", customerContext.customerId)
            .eq("coupon_id", coupon.id)
            .is("redeemed_at", null)
            .maybeSingle();
          if (entitlementError) throw entitlementError;
          if (!entitlement) return apiError("Este cupom não está disponível para sua conta.", 409);
        }
      }
    }

    const { data, error } = await client.rpc("public_store_checkout", {
      p_slug: slug,
      p_submission_id: payload.submissionId.trim(),
      p_customer_name: payload.identified ? payload.name?.trim() ?? null : null,
      p_customer_phone: payload.identified ? payload.phone?.trim() ?? null : null,
      p_fulfillment: payload.fulfillment,
      p_delivery_address: payload.fulfillment === "delivery" ? payload.address ?? {} : null,
      p_payment_method: payload.paymentMethod,
      p_coupon_code: couponCode || null,
      p_items: payload.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        additions: item.additions ?? [],
        note: item.note?.trim() || null,
        configuration: item.configuration ? {
          kind: item.configuration.kind,
          mode: item.configuration.mode,
          size: item.configuration.size.trim(),
          ...(item.configuration.mode === "half" && item.configuration.secondProductId ? { second_product_id: item.configuration.secondProductId } : {}),
        } : {},
      })),
    });
    if (error) {
      console.error("[public-storefront] checkout rejeitado", error.code, error.message);
      return apiError(safeCheckoutMessage(error.message), 409);
    }

    let order = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!order?.id) throw new Error("RPC não retornou pedido.");

    if (!customerContext) customerContext = await authenticatedCustomer(client, slug);
    if (customerContext) {
      const { data: linked, error: linkError } = await client.rpc("link_public_store_order_customer", { p_order: String(order.id), p_customer: customerContext.customerId });
      if (linkError) console.error("[public-storefront] vínculo de cliente não aplicado", linkError.code, linkError.message);
      else if (linked) order = (Array.isArray(linked) ? linked[0] : linked) as Record<string, unknown>;

      if (couponCode) {
        const { error: markError } = await client.rpc("mark_store_customer_coupon_redeemed", {
          p_company: customerContext.companyId,
          p_customer: customerContext.customerId,
          p_code: couponCode,
          p_order: String(order.id),
        });
        if (markError) console.error("[public-storefront] entitlement de cupom não marcado", markError.code, markError.message);
      }
    }

    let trackingToken: string | undefined;
    if (payload.fulfillment === "delivery") {
      const { data: delivery, error: deliveryError } = await client.from("deliveries").select("public_tracking_token").eq("order_id", String(order.id)).maybeSingle();
      if (deliveryError) console.error("[public-storefront] tracking token indisponível", deliveryError.code, deliveryError.message);
      else if (delivery?.public_tracking_token) trackingToken = String(delivery.public_tracking_token);
    }

    const result: PublicCheckoutResult = {
      id: String(order.id), number: Number(order.number), total: Number(order.total_cents) / 100,
      discount: Number(order.discount_cents) / 100, deliveryFee: Number(order.delivery_fee_cents) / 100,
      status: String(order.status), paymentStatus: String(order.payment_status),
      fulfillment: String(order.fulfillment) as PublicCheckoutResult["fulfillment"], createdAt: String(order.created_at), trackingToken,
    };
    return NextResponse.json({ order: result }, { status: 201 });
  } catch (error) {
    console.error("[public-storefront] falha no checkout", error instanceof Error ? error.message : "erro desconhecido");
    return apiError("Checkout temporariamente indisponível.", 503);
  }
}
