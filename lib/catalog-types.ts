export type CategoryStatus = "active" | "inactive";
export type ProductStatus = "available" | "out_of_stock" | "inactive";
export type StockMovementType = "entry" | "exit" | "adjustment";

export interface Category {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  status: CategoryStatus;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  imageUrl?: string;
  sku?: string;
  trackStock: boolean;
  currentStock: number;
  minimumStock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  companyId: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  reason: string;
  createdAt: string;
}

export interface ProductOption {
  id: string;
  companyId: string;
  productId: string;
  name: string;
  price: number;
  status: "active" | "inactive";
  displayOrder: number;
}

export interface CatalogState {
  version: 1;
  company: { id: string; name: string };
  categories: Category[];
  products: Product[];
  productOptions: ProductOption[];
  movements: StockMovement[];
}

export type CategoryInput = Pick<Category, "name" | "description" | "status" | "displayOrder">;
export type ProductInput = Omit<Product, "id" | "companyId" | "createdAt" | "updatedAt">;
export type ProductOptionInput = Pick<ProductOption, "productId" | "name" | "price" | "status" | "displayOrder">;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
