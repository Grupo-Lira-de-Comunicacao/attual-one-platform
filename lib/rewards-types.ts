import type { PaymentMethod, PaymentStatus } from "./commerce-types.ts";
export type CouponType="percentage"|"fixed";
export type LoyaltyMode="points"|"buy_and_get";
export type LoyaltyTransactionType="credit"|"debit"|"reward"|"reversal";
export interface Coupon{id:string;companyId:string;code:string;description?:string;type:CouponType;value:number;minimumOrder:number;usageLimit?:number;perCustomerLimit?:number;usageCount:number;startsAt:string;expiresAt:string;status:"active"|"inactive";createdAt:string;updatedAt:string}
export interface Payment{id:string;companyId:string;orderId:string;orderNumber:number;customerName:string;amount:number;method:PaymentMethod;status:PaymentStatus;reference?:string;notes?:string;tenderedAmount?:number;changeAmount?:number;createdAt:string;updatedAt:string}
export interface LoyaltyProgram{id:string;companyId:string;name:string;mode:LoyaltyMode;pointsPerReal:number;rewardThreshold:number;rewardDescription:string;status:"active"|"inactive"}
export interface LoyaltyAccount{id:string;companyId:string;customerId:string;customerName:string;points:number;purchaseCount:number;rewardsAvailable:number;creditedOrderIds:string[];updatedAt:string}
export interface LoyaltyTransaction{id:string;companyId:string;accountId:string;customerName:string;type:LoyaltyTransactionType;points:number;purchases:number;rewards:number;reason:string;createdAt:string}
export interface RewardsState{version:1;companyId:string;coupons:Coupon[];payments:Payment[];program:LoyaltyProgram;accounts:LoyaltyAccount[];loyaltyTransactions?:LoyaltyTransaction[]}
export type CouponInput=Omit<Coupon,"id"|"companyId"|"usageCount"|"createdAt"|"updatedAt">;
