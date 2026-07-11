import { initialCatalogState } from "./catalog-seed.ts";
import type { CatalogState, CategoryInput, ProductInput, StockMovementType, StorageAdapter } from "./catalog-types.ts";

export const CATALOG_STORAGE_KEY = "attual-one:catalog:v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export class CatalogService {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) { this.storage = storage; }

  load(): CatalogState {
    const stored = this.storage.getItem(CATALOG_STORAGE_KEY);
    if (!stored) {
      const initial = clone(initialCatalogState);
      this.save(initial);
      return initial;
    }
    try { return JSON.parse(stored) as CatalogState; }
    catch { throw new Error("Não foi possível ler os dados locais."); }
  }

  save(state: CatalogState) { this.storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(state)); }

  createCategory(input: CategoryInput) {
    const state = this.load();
    this.validateCategory(input);
    const now = new Date().toISOString();
    state.categories.push({ ...input, name: input.name.trim(), id: uid("cat"), companyId: state.company.id, createdAt: now, updatedAt: now });
    this.save(state); return state;
  }

  updateCategory(id: string, input: CategoryInput) {
    const state = this.load(); this.validateCategory(input);
    const index = state.categories.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Categoria não encontrada.");
    state.categories[index] = { ...state.categories[index], ...input, name: input.name.trim(), updatedAt: new Date().toISOString() };
    this.save(state); return state;
  }

  deleteCategory(id: string) {
    const state = this.load();
    if (state.products.some((product) => product.categoryId === id)) throw new Error("Mova os produtos desta categoria antes de excluí-la.");
    state.categories = state.categories.filter((item) => item.id !== id); this.save(state); return state;
  }

  createProduct(input: ProductInput) {
    const state = this.load(); this.validateProduct(input, state);
    const now = new Date().toISOString();
    const product = { ...input, name: input.name.trim(), currentStock: input.trackStock ? input.currentStock : 0, status: this.statusFor(input), id: uid("prod"), companyId: state.company.id, createdAt: now, updatedAt: now };
    state.products.push(product); this.save(state); return state;
  }

  updateProduct(id: string, input: ProductInput) {
    const state = this.load(); this.validateProduct(input, state);
    const index = state.products.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Produto não encontrado.");
    state.products[index] = { ...state.products[index], ...input, name: input.name.trim(), currentStock: input.trackStock ? input.currentStock : 0, status: this.statusFor(input), updatedAt: new Date().toISOString() };
    this.save(state); return state;
  }

  deleteProduct(id: string) {
    const state = this.load();
    state.products = state.products.filter((item) => item.id !== id);
    state.movements = state.movements.filter((item) => item.productId !== id);
    this.save(state); return state;
  }

  moveStock(productId: string, type: StockMovementType, quantity: number, reason: string) {
    const state = this.load();
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Produto não encontrado.");
    if (!product.trackStock) throw new Error("Este produto não controla estoque.");
    if (!reason.trim()) throw new Error("Informe o motivo da movimentação.");
    if (!Number.isFinite(quantity) || quantity < 0 || (type !== "adjustment" && quantity === 0)) throw new Error("Informe uma quantidade válida.");
    const previous = product.currentStock;
    const resulting = type === "entry" ? previous + quantity : type === "exit" ? previous - quantity : quantity;
    if (resulting < 0) throw new Error("O estoque não pode ficar negativo.");
    product.currentStock = resulting;
    if (product.status !== "inactive") product.status = resulting === 0 ? "out_of_stock" : "available";
    product.updatedAt = new Date().toISOString();
    state.movements.unshift({ id: uid("mov"), companyId: state.company.id, productId, type, quantity: type === "adjustment" ? Math.abs(resulting - previous) : quantity, previousStock: previous, resultingStock: resulting, reason: reason.trim(), createdAt: new Date().toISOString() });
    this.save(state); return state;
  }

  isLowStock(productId: string) {
    const product = this.load().products.find((item) => item.id === productId);
    return Boolean(product?.trackStock && product.currentStock <= product.minimumStock);
  }

  private validateCategory(input: CategoryInput) {
    if (!input.name.trim()) throw new Error("O nome da categoria é obrigatório.");
    if (input.displayOrder < 0) throw new Error("A ordem não pode ser negativa.");
  }

  private validateProduct(input: ProductInput, state: CatalogState) {
    if (!input.name.trim()) throw new Error("O nome do produto é obrigatório.");
    if (!input.categoryId || !state.categories.some((item) => item.id === input.categoryId)) throw new Error("A categoria é obrigatória.");
    if (input.price < 0 || (input.promotionalPrice !== undefined && input.promotionalPrice < 0)) throw new Error("O preço não pode ser negativo.");
    if (input.currentStock < 0 || input.minimumStock < 0) throw new Error("O estoque não pode ser negativo.");
  }

  private statusFor(input: ProductInput) {
    if (input.status === "inactive") return "inactive" as const;
    return input.trackStock && input.currentStock === 0 ? "out_of_stock" as const : "available" as const;
  }
}

export const createBrowserCatalogService = () => new CatalogService(window.localStorage);
