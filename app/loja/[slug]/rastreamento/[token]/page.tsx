import type { Metadata } from "next";
import { DeliveryTracking } from "@/components/delivery-tracking";

export const metadata: Metadata = { title: "Acompanhar entrega | ATTUAL ONE" };

export default async function TrackingPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { token } = await params;
  return <DeliveryTracking token={token} />;
}
