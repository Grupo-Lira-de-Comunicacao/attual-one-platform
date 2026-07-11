import type { CommerceState, OrderStatus } from "./commerce-types.ts";

const companyId = "hamburgueria-07";
const dates = ["2026-07-10T12:05:00.000Z","2026-07-10T12:18:00.000Z","2026-07-10T12:34:00.000Z","2026-07-10T12:49:00.000Z","2026-07-10T13:02:00.000Z","2026-07-10T13:17:00.000Z"];
const customerRows = [
  ["cus-1","Ana Clara","(12) 98821-4455","ana@email.com","Centro","Caçapava"],
  ["cus-2","Rafael Martins","(12) 99770-1122","rafael@email.com","Vila Menino Jesus","Caçapava"],
  ["cus-3","Beatriz Souza","(12) 99115-8030","","Jardim Rafael","Caçapava"],
  ["cus-4","Carlos Eduardo","(12) 98844-2099","carlos@email.com","Centro","Caçapava"],
  ["cus-5","Fernanda Alves","(12) 99601-7754","","Vera Cruz","Caçapava"],
  ["cus-6","João Pedro","(12) 98210-3344","joao@email.com","Nova Caçapava","Caçapava"],
];
const customers = customerRows.map(([id,name,phone,email,district,city],i) => ({ id, companyId, name, phone, email: email || undefined, address: { street: `Rua Exemplo ${i+1}`, number: String(100+i), district, city, postalCode: `1228${i}-000` }, notes: i===0?"Prefere contato por WhatsApp":"", status: "active" as const, createdAt: dates[i], updatedAt: dates[i] }));
const orderRows: [number,string|undefined,string,OrderStatus,string,string,number][] = [
  [1048,"cus-1","Ana Clara","new","prod-1","Smash Bacon",2], [1047,"cus-2","Rafael Martins","confirmed","prod-4","Combo Duplo 07",1],
  [1046,"cus-3","Beatriz Souza","preparing","prod-2","Clássico 07",2], [1045,"cus-4","Carlos Eduardo","ready","prod-3","Veggie Garden",1],
  [1044,"cus-5","Fernanda Alves","out_for_delivery","prod-6","Fritas Crocantes",2], [1043,"cus-6","João Pedro","completed","prod-8","Coca-Cola Lata",4],
  [1042,undefined,"Consumidor não identificado","cancelled","prod-2","Clássico 07",1], [1041,"cus-1","Ana Clara","completed","prod-4","Combo Duplo 07",2],
];
const prices: Record<string,number>={"prod-1":44.9,"prod-2":39.9,"prod-3":37.9,"prod-4":52,"prod-6":22.9,"prod-8":7};
const orders = orderRows.map(([number,customerId,customerName,status,productId,productName,quantity],i) => { const subtotal=prices[productId]*quantity; return { id:`ord-${number}`,companyId,number,customerId,customerName,customerPhone:customers.find(c=>c.id===customerId)?.phone,createdAt:new Date(Date.parse("2026-07-10T10:00:00.000Z")+i*900000).toISOString(),updatedAt:new Date(Date.parse("2026-07-10T10:00:00.000Z")+i*900000).toISOString(),items:[{id:`item-${number}`,productId,productName,unitPrice:prices[productId],quantity,additions:[],total:subtotal}],fulfillment:i%3===0?"delivery" as const:i%3===1?"pickup" as const:"dine_in" as const,deliveryAddress:i%3===0?customers.find(c=>c.id===customerId)?.address:undefined,subtotal,discount:0,deliveryFee:i%3===0?6:0,total:subtotal+(i%3===0?6:0),paymentMethod:i%2===0?"pix" as const:"credit_card" as const,paymentStatus:i<2?"pending" as const:"paid" as const,status,stockApplied:!["new","cancelled"].includes(status),cancellationReason:status==="cancelled"?"Cliente desistiu":undefined}; });
export const initialCommerceState: CommerceState = { version:1, companyId, nextOrderNumber:1049, customers, orders };
