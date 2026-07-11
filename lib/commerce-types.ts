import type { StorageAdapter } from "./catalog-types.ts";

export type CustomerStatus = "active" | "inactive";
export type FulfillmentType = "pickup" | "delivery" | "dine_in";
export type PaymentMethod = "pix" | "cash" | "credit_card" | "debit_card";
export type PaymentStatus = "pending" | "paid" | "partial" | "refunded";
export type OrderStatus = "new" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";

export interface Address { street: string; number: string; complement?: string; district: string; city: string; postalCode: string; }
export interface Customer {
  id: string; companyId: string; name: string; phone: string; email?: string; taxId?: string;
  address: Address; notes?: string; status: CustomerStatus; createdAt: string; updatedAt: string;
}
export interface OrderItem {
  id: string; productId: string; productName: string; unitPrice: number; quantity: number;
  additions: string[]; note?: string; total: number;
}
export interface Order {
  id: string; companyId: string; number: number; customerId?: string; customerName: string; customerPhone?: string;
  createdAt: string; updatedAt: string; items: OrderItem[]; fulfillment: FulfillmentType; deliveryAddress?: Address;
  subtotal: number; discount: number; deliveryFee: number; total: number; paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus; status: OrderStatus; stockApplied: boolean; cancellationReason?: string;
}
export interface CommerceState { version: 1; companyId: string; nextOrderNumber: number; customers: Customer[]; orders: Order[]; }
export type CustomerInput = Omit<Customer, "id" | "companyId" | "createdAt" | "updatedAt">;
export type OrderDraft = Pick<Order, "customerId" | "customerName" | "customerPhone" | "items" | "fulfillment" | "deliveryAddress" | "discount" | "deliveryFee" | "paymentMethod" | "paymentStatus">;
export type { StorageAdapter };
