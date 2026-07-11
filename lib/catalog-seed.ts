import type { CatalogState } from "./catalog-types.ts";

const now = "2026-07-10T12:00:00.000Z";
const companyId = "hamburgueria-07";

export const initialCatalogState: CatalogState = {
  version: 1,
  company: { id: companyId, name: "Hamburgueria 07" },
  categories: [
    { id: "cat-burgers", companyId, name: "Hambúrgueres", description: "Artesanais e smash", status: "active", displayOrder: 1, createdAt: now, updatedAt: now },
    { id: "cat-combos", companyId, name: "Combos", description: "Lanche, acompanhamento e bebida", status: "active", displayOrder: 2, createdAt: now, updatedAt: now },
    { id: "cat-portions", companyId, name: "Porções", description: "Acompanhamentos para compartilhar", status: "active", displayOrder: 3, createdAt: now, updatedAt: now },
    { id: "cat-drinks", companyId, name: "Bebidas", description: "Refrigerantes, sucos e água", status: "active", displayOrder: 4, createdAt: now, updatedAt: now },
  ],
  products: [
    ["prod-1", "cat-burgers", "Smash Bacon", "Pão brioche, carne 120g, bacon e cheddar", 44.9, 18, 8, "H07-SB"],
    ["prod-2", "cat-burgers", "Clássico 07", "Carne 150g, queijo, salada e molho da casa", 39.9, 12, 6, "H07-CL"],
    ["prod-3", "cat-burgers", "Veggie Garden", "Burger vegetal, queijo e salada fresca", 37.9, 4, 5, "H07-VG"],
    ["prod-4", "cat-combos", "Combo Duplo 07", "Duplo smash, fritas e refrigerante", 52, 9, 5, "H07-CD"],
    ["prod-5", "cat-combos", "Combo Família", "4 clássicos, 2 fritas e refrigerante 2L", 149.9, 3, 3, "H07-CF"],
    ["prod-6", "cat-portions", "Fritas Crocantes", "Batatas sequinhas com tempero especial", 22.9, 25, 10, "H07-FR"],
    ["prod-7", "cat-portions", "Onion Rings", "Anéis de cebola empanados", 24.9, 0, 5, "H07-OR"],
    ["prod-8", "cat-drinks", "Coca-Cola Lata", "Lata 350ml gelada", 7, 36, 12, "H07-CC"],
    ["prod-9", "cat-drinks", "Suco de Laranja", "Natural, copo 400ml", 12.9, 7, 6, "H07-SL"],
  ].map(([id, categoryId, name, description, price, currentStock, minimumStock, sku]) => ({
    id: String(id), companyId, categoryId: String(categoryId), name: String(name), description: String(description),
    price: Number(price), sku: String(sku), trackStock: true, currentStock: Number(currentStock), minimumStock: Number(minimumStock),
    status: Number(currentStock) === 0 ? "out_of_stock" as const : "available" as const, createdAt: now, updatedAt: now,
  })),
  movements: [],
};
