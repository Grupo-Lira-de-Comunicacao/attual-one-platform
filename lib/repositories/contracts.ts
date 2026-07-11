import type { CatalogState, CategoryInput, ProductInput, ProductOptionInput, StockMovementType } from "@/lib/catalog-types";
import type { CommerceState, CustomerInput, OrderDraft, OrderStatus } from "@/lib/commerce-types";
import type { CouponInput, RewardsState } from "@/lib/rewards-types";
export interface CatalogRepository {
  load(): Promise<CatalogState>;
  createCategory(input: CategoryInput): Promise<CatalogState>;
  updateCategory(id: string, input: CategoryInput): Promise<CatalogState>;
  deleteCategory(id: string): Promise<CatalogState>;
  createProduct(input: ProductInput): Promise<CatalogState>;
  updateProduct(id: string, input: ProductInput): Promise<CatalogState>;
  deleteProduct(id: string): Promise<CatalogState>;
  moveStock(productId: string, type: StockMovementType, quantity: number, reason: string): Promise<CatalogState>;
  createProductOption?(input: ProductOptionInput): Promise<CatalogState>;
  updateProductOption?(id: string, input: ProductOptionInput): Promise<CatalogState>;
  deleteProductOption?(id: string): Promise<CatalogState>;
}
export interface CommerceRepository { load(): Promise<CommerceState>; createCustomer(input: CustomerInput): Promise<CommerceState>; createOrder(input: OrderDraft): Promise<CommerceState>; changeStatus(id: string, status: OrderStatus, reason?: string): Promise<CommerceState>; }
export interface RewardsRepository { load(): Promise<RewardsState>; createCoupon(input: CouponInput): Promise<RewardsState>; registerPayment(orderId: string, method: "pix"|"cash"|"credit_card"|"debit_card", status: "pending"|"paid"|"refunded"): Promise<RewardsState>; }
export interface RepositorySet { catalog: CatalogRepository; commerce: CommerceRepository; rewards: RewardsRepository; mode: "local"|"supabase"; }
