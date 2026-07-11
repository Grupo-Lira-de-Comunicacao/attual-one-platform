import type { OrderStatus, PaymentMethod } from "./commerce-types.ts";
export type AnalyticsPeriod="today"|"7d"|"30d"|"all";
export interface MetricPoint{label:string;value:number}
export interface RankedItem{id:string;name:string;quantity:number;revenue:number}
export interface StatusMetric{status:OrderStatus;count:number;total:number}
export interface AnalyticsSnapshot{period:AnalyticsPeriod;referenceDate:string;orders:number;openOrders:number;revenue:number;paidRevenue:number;averageTicket:number;customers:number;newCustomers:number;lowStock:number;outOfStock:number;salesSeries:MetricPoint[];topProducts:RankedItem[];topCustomers:RankedItem[];ordersByStatus:StatusMetric[];paymentsByMethod:{method:PaymentMethod;count:number;total:number}[];stockValue:number;recentOrderIds:string[]}
export interface PaginatedResult<T>{rows:T[];totalCount:number;page:number;pageSize:number}
export interface ProductReportRow{id:string;name:string;sku?:string;quantity:number;revenue:number;currentStock:number;minimumStock:number;status:string}
export interface CustomerReportRow{id:string;name:string;phone?:string;ordersCount:number;revenue:number}
export interface StockReportRow{id:string;name:string;sku?:string;currentStock:number;minimumStock:number;status:string;trackStock:boolean}
