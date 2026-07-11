"use client";
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicConfig } from "./config";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function createSupabaseBrowserClient() { if (client) return client; const config = requireSupabasePublicConfig(); client = createBrowserClient(config.url, config.publishableKey); return client; }
