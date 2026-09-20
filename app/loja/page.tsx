import { createClient } from "@supabase/supabase-js";
import { PublicStoreDirectory, type PublicStoreDirectoryItem } from "@/components/public-store-directory";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function cleanProfile(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function profileText(profile: Record<string, unknown>, key: string): string {
  const value = profile[key];
  return typeof value === "string" ? value.trim() : "";
}

function initials(name: string, configured: string): string {
  if (configured) return configured.slice(0, 4).toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase() || "AO";
}

async function loadPublicStores(): Promise<PublicStoreDirectoryItem[]> {
  const config = requireSupabasePublicConfig();
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from("companies")
    .select("name,slug,public_store_open,public_profile")
    .eq("public_store_enabled", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const profile = cleanProfile(row.public_profile);
    const name = String(row.name ?? "").trim();
    return {
      name,
      slug: String(row.slug ?? "").trim(),
      open: Boolean(row.public_store_open),
      city: profileText(profile, "city"),
      state: profileText(profile, "state"),
      tagline: profileText(profile, "tagline") || profileText(profile, "description"),
      logoText: initials(name, profileText(profile, "logo_text")),
    };
  }).filter((store) => store.name && store.slug);
}

export default async function StoreIndexPage() {
  let stores: PublicStoreDirectoryItem[] = [];
  let unavailable = false;

  try {
    stores = await loadPublicStores();
  } catch (error) {
    console.error("[public-store-directory] falha ao carregar lojas", error instanceof Error ? error.message : "erro desconhecido");
    unavailable = true;
  }

  return <PublicStoreDirectory stores={stores} unavailable={unavailable} />;
}
