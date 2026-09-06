import type { PublicCheckoutResult, PublicItemConfiguration } from "@/lib/public-storefront-types";

export type StoreCustomerAddress = {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  postalCode: string;
};

export type StoreCustomerProfile = {
  name: string;
  phone: string;
  address: StoreCustomerAddress;
};

export type StoredOrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  additions: string[];
  note: string;
  configuration?: PublicItemConfiguration;
};

export type StoredCustomerOrder = {
  id: string;
  number: number;
  total: number;
  status: string;
  fulfillment: PublicCheckoutResult["fulfillment"];
  createdAt: string;
  trackingToken?: string;
  items: StoredOrderItem[];
};

const profileKey = (slug: string) => `attual-one:store:${slug}:profile:v1`;
const ordersKey = (slug: string) => `attual-one:store:${slug}:orders:v1`;

export function loadStoreCustomerProfile(slug: string): StoreCustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(profileKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreCustomerProfile;
    if (!parsed || typeof parsed.name !== "string" || typeof parsed.phone !== "string" || !parsed.address) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoreCustomerProfile(slug: string, profile: StoreCustomerProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(profileKey(slug), JSON.stringify(profile));
}

export function loadStoredCustomerOrders(slug: string): StoredCustomerOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ordersKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCustomerOrder[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function rememberCustomerOrder(slug: string, order: StoredCustomerOrder) {
  if (typeof window === "undefined") return;
  const current = loadStoredCustomerOrders(slug).filter((item) => item.id !== order.id);
  window.localStorage.setItem(ordersKey(slug), JSON.stringify([order, ...current].slice(0, 20)));
}
