import type { StorageAdapter } from "../catalog-types.ts";
import { CatalogService } from "../catalog-service.ts";
import { CommerceService } from "../commerce-service.ts";
import { RewardsService } from "../rewards-service.ts";
import type { RepositorySet } from "./contracts.ts";
export function createLocalRepositories(storage: StorageAdapter): RepositorySet { const catalog = new CatalogService(storage), commerce = new CommerceService(storage), rewards = new RewardsService(storage); return { mode: "local", catalog: { load: async()=>catalog.load(), createCategory:async(i)=>catalog.createCategory(i), createProduct:async(i)=>catalog.createProduct(i), moveStock:async(...a)=>catalog.moveStock(...a) }, commerce: { load:async()=>commerce.load(), createCustomer:async(i)=>commerce.createCustomer(i), createOrder:async(i)=>commerce.createOrder(i), changeStatus:async(...a)=>commerce.changeStatus(...a) }, rewards: { load:async()=>rewards.load(), createCoupon:async(i)=>rewards.createCoupon(i), registerPayment:async(id,m,s)=>rewards.registerPayment(id,m,s) } }; }
