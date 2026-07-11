import type { OrderStatus, PaymentMethod } from "./commerce-types.ts";
export type AnalyticsPeriod="today"|"7d"|"30d"|"all";
export interface MetricPoint{label:string;value:number}
export interface RankedItem{id:string;name:string;quantity:number;revenue:number}
export interface StatusMetric{status:OrderStatus;count:number;total:number}
export interface AnalyticsSnapshot{period:AnalyticsPeriod;referenceDate:string;orders:number;openOrders:number;revenue:number;paidRevenue:number;averageTicket:number;customers:number;newCustomers:number;lowStock:number;outOfStock:number;salesSeries:MetricPoint[];topProducts:RankedItem[];topCustomers:RankedItem[];ordersByStatus:StatusMetric[];paymentsByMethod:{method:PaymentMethod;count:number;total:number}[];stockValue:number;recentOrderIds:string[]}
