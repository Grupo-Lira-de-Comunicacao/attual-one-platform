import type { CatalogState, CategoryInput, ProductInput, ProductOptionInput, StockMovementType } from "@/lib/catalog-types";
import type { CommerceState, CustomerInput, OrderDraft, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/commerce-types";
import type { CouponInput, LoyaltyMode, RewardsState } from "@/lib/rewards-types";
import type { AnalyticsPeriod, AnalyticsSnapshot, CustomerReportRow, PaginatedResult, ProductReportRow, StockReportRow } from "@/lib/analytics-types";
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
export interface CommerceRepository {
  load(): Promise<CommerceState>;
  createCustomer(input: CustomerInput): Promise<CommerceState>;
  updateCustomer(id: string, input: CustomerInput): Promise<CommerceState>;
  deleteCustomer(id: string): Promise<CommerceState>;
  createOrder(input: OrderDraft): Promise<CommerceState>;
  updateOrder(id: string, input: OrderDraft): Promise<CommerceState>;
  changeStatus(id: string, status: OrderStatus, reason?: string): Promise<CommerceState>;
}
export interface PaymentLegInput { method: PaymentMethod; amount: number; tenderedAmount?: number; status: PaymentStatus; reference?: string; notes?: string; }
export interface RewardsRepository {
  load(): Promise<RewardsState>;
  createCoupon(input: CouponInput): Promise<RewardsState>;
  updateCoupon(id: string, input: CouponInput): Promise<RewardsState>;
  deleteCoupon(id: string): Promise<RewardsState>;
  registerPayment(orderId: string, method: PaymentMethod, status: PaymentStatus, reference?: string, notes?: string): Promise<RewardsState>;
  refundPayment(paymentId: string, amount: number, reason: string, fullRefund?: boolean): Promise<RewardsState>;
  updateProgram(mode: LoyaltyMode, pointsPerReal: number, rewardThreshold: number, rewardDescription: string): Promise<RewardsState>;
  syncLoyalty?(): Promise<RewardsState>;
  registerPaymentSplit?(orderId: string, legs: PaymentLegInput[]): Promise<RewardsState>;
  applyCouponToOrder?(orderId: string, code: string): Promise<RewardsState>;
  redeemReward?(customerId: string, reason?: string): Promise<RewardsState>;
}
export interface AnalyticsRepository {
  getSnapshot(period: AnalyticsPeriod): Promise<AnalyticsSnapshot>;
  getProductsReport(period: AnalyticsPeriod, search: string, page: number, pageSize: number): Promise<PaginatedResult<ProductReportRow>>;
  getCustomersReport(period: AnalyticsPeriod, search: string, page: number, pageSize: number): Promise<PaginatedResult<CustomerReportRow>>;
  getStockReport(search: string, page: number, pageSize: number): Promise<PaginatedResult<StockReportRow>>;
}
export interface RepositorySet { catalog: CatalogRepository; commerce: CommerceRepository; rewards: RewardsRepository; analytics: AnalyticsRepository; mode: "local"|"supabase"; }
