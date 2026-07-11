import type{Address,FulfillmentType,PaymentMethod}from"./commerce-types.ts";
export interface StorefrontConfig{companyId:string;name:string;tagline:string;logoText:string;coverMessage:string;open:boolean;acceptOrdersWhenClosed:boolean;openingHours:string;closedMessage:string;deliveryFee:number}
export interface CartItem{productId:string;productName:string;unitPrice:number;quantity:number;additions:string[];note?:string}
export interface CartState{version:1;items:CartItem[];couponCode?:string;discount:number;updatedAt:string}
export interface CheckoutInput{submissionId:string;identified:boolean;name?:string;phone?:string;fulfillment:FulfillmentType;address?:Address;paymentMethod:PaymentMethod;couponCode?:string}
export interface StorefrontState{version:1;config:StorefrontConfig;cart:CartState;lastOrderId?:string;submissions:Record<string,string>}
