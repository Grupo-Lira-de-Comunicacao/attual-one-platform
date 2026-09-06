export type DeliveryStatus = "pending" | "assigned" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
export type AgeHandoffStatus = "not_required" | "document_required" | "verified";

export type PublicDeliveryTracking = {
  orderNumber: number;
  orderStatus: string;
  deliveryStatus: DeliveryStatus;
  storeName: string;
  storeSlug: string;
  driverName?: string;
  currentLocation?: { lat: number; lng: number; accuracy?: number; updatedAt: string };
  destination?: { street?: string; number?: string; district?: string; city?: string };
  updatedAt: string;
};

export type DriverDelivery = PublicDeliveryTracking & {
  customerName: string;
  customerPhone?: string;
  driverPhone?: string;
  driverToken: string;
  requiresAgeDocument?: boolean;
  ageHandoffStatus?: AgeHandoffStatus;
};
