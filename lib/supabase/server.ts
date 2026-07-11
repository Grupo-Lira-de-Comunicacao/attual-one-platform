import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublicConfig } from "./config";
export async function createSupabaseServerClient() { const config = requireSupabasePublicConfig(); const store = await cookies(); return createServerClient(config.url, config.publishableKey, { cookies: { getAll: () => store.getAll(), setAll: (values) => { try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* middleware performs refresh when component cookies are read-only */ } } } }); }
