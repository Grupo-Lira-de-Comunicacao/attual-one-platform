import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Address = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  postalCode?: string;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Conta do consumidor não configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanAddress(value: unknown): Address {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    street: cleanText(row.street, 160),
    number: cleanText(row.number, 40),
    complement: cleanText(row.complement, 120),
    district: cleanText(row.district, 120),
    city: cleanText(row.city, 120),
    postalCode: cleanText(row.postalCode, 20),
  };
}

async function contextFor(slug: string) {
  const auth = await createSupabaseServerClient();
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) return { unauthorized: true as const };

  const admin = adminClient();
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id,name,slug")
    .eq("slug", slug)
    .eq("public_store_enabled", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (companyError) throw companyError;
  if (!company) return { notFound: true as const };

  const { data: account, error: accountError } = await admin
    .from("store_customer_accounts")
    .select("id,company_id,auth_user_id,customer_id,email,name,phone,address,created_at,updated_at")
    .eq("company_id", company.id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (accountError) throw accountError;

  return { admin, company, user: userData.user, account };
}

async function ensureWelcomeCoupon(admin: ReturnType<typeof adminClient>, companyId: string, customerId?: string | null) {
  if (!customerId) return;
  const { error } = await admin.rpc("provision_store_welcome_coupon", { p_company: companyId, p_customer: customerId });
  if (error) console.error("[store-customer-account] cupom de boas-vindas", error.code, error.message);
}

async function accountPayload(admin: ReturnType<typeof adminClient>, company: { id: string; name: string; slug: string }, user: { id: string; email?: string | null }, account: Record<string, unknown> | null) {
  let orders: Array<Record<string, unknown>> = [];
  const customerId = account?.customer_id ? String(account.customer_id) : "";

  if (customerId) {
    const { data: orderRows, error: orderError } = await admin
      .from("orders")
      .select("id,number,total_cents,status,payment_status,fulfillment,created_at,delivery_address")
      .eq("company_id", company.id)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (orderError) throw orderError;

    const ids = (orderRows ?? []).map((row) => row.id);
    const [{ data: itemRows, error: itemError }, { data: deliveryRows, error: deliveryError }] = ids.length ? await Promise.all([
      admin.from("order_items").select("order_id,product_id,product_name,unit_price_cents,quantity,additions,note,total_cents").in("order_id", ids),
      admin.from("deliveries").select("order_id,public_tracking_token,status").in("order_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (itemError) throw itemError;
    if (deliveryError) throw deliveryError;

    const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const item of itemRows ?? []) {
      const key = String(item.order_id);
      const list = itemsByOrder.get(key) ?? [];
      list.push({
        productId: item.product_id ? String(item.product_id) : "",
        productName: String(item.product_name),
        unitPrice: Number(item.unit_price_cents) / 100,
        quantity: Number(item.quantity),
        additions: Array.isArray(item.additions) ? item.additions : [],
        note: String(item.note ?? ""),
      });
      itemsByOrder.set(key, list);
    }
    const deliveryByOrder = new Map((deliveryRows ?? []).map((row) => [String(row.order_id), row]));
    orders = (orderRows ?? []).map((order) => {
      const delivery = deliveryByOrder.get(String(order.id));
      return {
        id: String(order.id),
        number: Number(order.number),
        total: Number(order.total_cents) / 100,
        status: String(order.status),
        paymentStatus: String(order.payment_status),
        fulfillment: String(order.fulfillment),
        createdAt: String(order.created_at),
        address: order.delivery_address ?? null,
        trackingToken: delivery?.public_tracking_token ? String(delivery.public_tracking_token) : undefined,
        items: itemsByOrder.get(String(order.id)) ?? [],
      };
    });
  }

  const { data: ruleRow, error: ruleError } = await admin
    .from("loyalty_rules")
    .select("name,mode,points_per_real,reward_threshold,reward_description,reward_value_cents,reward_minimum_order_cents,reward_valid_days")
    .eq("company_id", company.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ruleError) throw ruleError;

  let loyalty = null;
  if (customerId) {
    const { data: loyaltyRow, error: loyaltyError } = await admin
      .from("loyalty_accounts")
      .select("points,purchase_count,rewards_available")
      .eq("company_id", company.id)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (loyaltyError) throw loyaltyError;
    if (loyaltyRow || ruleRow) loyalty = {
      points: Number(loyaltyRow?.points ?? 0),
      purchaseCount: Number(loyaltyRow?.purchase_count ?? 0),
      rewardsAvailable: Number(loyaltyRow?.rewards_available ?? 0),
      rule: ruleRow ? {
        name: String(ruleRow.name),
        mode: String(ruleRow.mode),
        pointsPerReal: Number(ruleRow.points_per_real),
        rewardThreshold: Number(ruleRow.reward_threshold),
        rewardDescription: String(ruleRow.reward_description),
        rewardValue: Number(ruleRow.reward_value_cents) / 100,
        rewardMinimumOrder: Number(ruleRow.reward_minimum_order_cents) / 100,
        rewardValidDays: Number(ruleRow.reward_valid_days),
      } : null,
    };
  }

  let coupons: Array<Record<string, unknown>> = [];
  if (customerId) {
    const { data: entitlementRows, error: entitlementError } = await admin
      .from("store_customer_coupon_entitlements")
      .select("id,source,redeemed_at,coupon_id,coupons(code,description,type,value,minimum_order_cents,starts_at,expires_at,status,usage_count,usage_limit)")
      .eq("company_id", company.id)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (entitlementError) throw entitlementError;

    coupons = (entitlementRows ?? []).map((row) => {
      const embedded = row.coupons as unknown;
      const coupon = (Array.isArray(embedded) ? embedded[0] : embedded) as Record<string, unknown> | null | undefined;
      return {
        id: String(row.id),
        source: String(row.source),
        redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
        code: String(coupon?.code ?? ""),
        description: String(coupon?.description ?? ""),
        type: String(coupon?.type ?? ""),
        value: coupon?.type === "percentage" ? Number(coupon?.value ?? 0) : Number(coupon?.value ?? 0) / 100,
        minimumOrder: Number(coupon?.minimum_order_cents ?? 0) / 100,
        startsAt: String(coupon?.starts_at ?? ""),
        expiresAt: String(coupon?.expires_at ?? ""),
        status: String(coupon?.status ?? "inactive"),
        used: Boolean(row.redeemed_at) || Number(coupon?.usage_count ?? 0) >= Number(coupon?.usage_limit ?? Number.MAX_SAFE_INTEGER),
      };
    });
  }

  return {
    authenticated: true,
    email: user.email ?? account?.email ?? "",
    profile: {
      name: String(account?.name ?? ""),
      phone: String(account?.phone ?? ""),
      address: account?.address && typeof account.address === "object" ? account.address : {},
    },
    orders,
    loyalty,
    coupons,
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  try {
    const ctx = await contextFor(slug);
    if ("unauthorized" in ctx) return NextResponse.json({ authenticated: false }, { status: 401 });
    if ("notFound" in ctx) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

    let account = ctx.account;
    if (!account) {
      const { data, error } = await ctx.admin.from("store_customer_accounts").insert({
        company_id: ctx.company.id,
        auth_user_id: ctx.user.id,
        email: ctx.user.email ?? null,
      }).select("id,company_id,auth_user_id,customer_id,email,name,phone,address,created_at,updated_at").single();
      if (error) throw error;
      account = data;
    }

    await ensureWelcomeCoupon(ctx.admin, ctx.company.id, account?.customer_id ? String(account.customer_id) : null);
    return NextResponse.json(await accountPayload(ctx.admin, ctx.company, ctx.user, account));
  } catch (error) {
    console.error("[store-customer-account] GET", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível carregar sua conta." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const name = cleanText(body.name, 160);
  const phone = cleanText(body.phone, 40);
  const address = cleanAddress(body.address);
  if (!name || !phone) return NextResponse.json({ error: "Informe nome e telefone." }, { status: 400 });

  try {
    const ctx = await contextFor(slug);
    if ("unauthorized" in ctx) return NextResponse.json({ error: "Entre na sua conta para salvar os dados." }, { status: 401 });
    if ("notFound" in ctx) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

    let customerId = ctx.account?.customer_id ? String(ctx.account.customer_id) : "";
    if (customerId) {
      const { error } = await ctx.admin.from("customers").update({
        name, phone, email: ctx.user.email ?? null, address, status: "active", updated_at: new Date().toISOString(),
      }).eq("id", customerId).eq("company_id", ctx.company.id);
      if (error) throw error;
    } else {
      const { data: customer, error } = await ctx.admin.from("customers").insert({
        company_id: ctx.company.id, name, phone, email: ctx.user.email ?? null, address, status: "active",
      }).select("id").single();
      if (error) throw error;
      customerId = String(customer.id);
    }

    const { data: account, error: accountError } = await ctx.admin.from("store_customer_accounts").upsert({
      company_id: ctx.company.id,
      auth_user_id: ctx.user.id,
      customer_id: customerId,
      email: ctx.user.email ?? null,
      name,
      phone,
      address,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,auth_user_id" }).select("id,company_id,auth_user_id,customer_id,email,name,phone,address,created_at,updated_at").single();
    if (accountError) throw accountError;

    await ensureWelcomeCoupon(ctx.admin, ctx.company.id, customerId);
    return NextResponse.json(await accountPayload(ctx.admin, ctx.company, ctx.user, account));
  } catch (error) {
    console.error("[store-customer-account] PUT", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível salvar sua conta." }, { status: 503 });
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  try {
    const ctx = await contextFor(slug);
    if ("unauthorized" in ctx) return NextResponse.json({ error: "Entre na sua conta para resgatar um prêmio." }, { status: 401 });
    if ("notFound" in ctx) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    const customerId = ctx.account?.customer_id ? String(ctx.account.customer_id) : "";
    if (!customerId) return NextResponse.json({ error: "Complete seu nome e telefone antes de resgatar." }, { status: 409 });

    const { error } = await ctx.admin.rpc("redeem_store_customer_reward", { p_company: ctx.company.id, p_customer: customerId });
    if (error) {
      const message = error.message.includes("STORE_REWARD_UNAVAILABLE") ? "Você ainda não tem prêmio disponível para resgate." : "Não foi possível resgatar o prêmio agora.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    await ensureWelcomeCoupon(ctx.admin, ctx.company.id, customerId);
    return NextResponse.json(await accountPayload(ctx.admin, ctx.company, ctx.user, ctx.account));
  } catch (error) {
    console.error("[store-customer-account] POST", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível resgatar seu prêmio." }, { status: 503 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugPattern.test(slug)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  const auth = await createSupabaseServerClient();
  await auth.auth.signOut();
  return NextResponse.json({ ok: true });
}
