import type { Metadata } from "next";
import { DriverDeliveryView } from "@/components/driver-delivery";

export const metadata: Metadata = { title: "ATTUAL ONE Entregas" };

export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverDeliveryView token={token} />;
}
