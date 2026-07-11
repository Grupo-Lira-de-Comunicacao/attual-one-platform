import test from "node:test";
import assert from "node:assert/strict";
import { CatalogService, CATALOG_STORAGE_KEY } from "../lib/catalog-service.ts";

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}

const setup = () => {
  const storage = new MemoryStorage();
  return { storage, service: new CatalogService(storage) };
};

test("cadastra, edita e exclui categoria", () => {
  const { service } = setup();
  let state = service.createCategory({ name: "Sobremesas", description: "Doces", status: "active", displayOrder: 5 });
  const category = state.categories.find(item => item.name === "Sobremesas");
  assert.ok(category);
  state = service.updateCategory(category.id, { name: "Doces", description: "Sobremesas", status: "inactive", displayOrder: 6 });
  assert.equal(state.categories.find(item => item.id === category.id)?.name, "Doces");
  state = service.deleteCategory(category.id);
  assert.equal(state.categories.some(item => item.id === category.id), false);
});

test("cadastra, edita e exclui produto", () => {
  const { service } = setup();
  const categoryId = service.load().categories[0].id;
  const input = { name: "Teste", description: "Produto", categoryId, price: 10, trackStock: true, currentStock: 4, minimumStock: 2, status: "available" };
  let state = service.createProduct(input);
  const product = state.products.find(item => item.name === "Teste");
  assert.ok(product);
  state = service.updateProduct(product.id, { ...input, name: "Teste editado", price: 12 });
  assert.equal(state.products.find(item => item.id === product.id)?.price, 12);
  state = service.deleteProduct(product.id);
  assert.equal(state.products.some(item => item.id === product.id), false);
});

test("registra entrada, saída e ajuste de estoque", () => {
  const { service } = setup();
  const product = service.load().products[0];
  const initial = product.currentStock;
  assert.equal(service.moveStock(product.id, "entry", 5, "Compra").products.find(p => p.id === product.id)?.currentStock, initial + 5);
  assert.equal(service.moveStock(product.id, "exit", 3, "Perda").products.find(p => p.id === product.id)?.currentStock, initial + 2);
  const state = service.moveStock(product.id, "adjustment", 7, "Inventário");
  assert.equal(state.products.find(p => p.id === product.id)?.currentStock, 7);
  assert.equal(state.movements.length, 3);
});

test("impede estoque negativo e exige motivo", () => {
  const { service } = setup();
  const product = service.load().products[0];
  assert.throws(() => service.moveStock(product.id, "exit", product.currentStock + 1, "Venda"), /negativo/);
  assert.throws(() => service.moveStock(product.id, "entry", 1, ""), /motivo/);
});

test("marca estoque baixo e esgotado automaticamente", () => {
  const { service } = setup();
  const product = service.load().products[0];
  service.moveStock(product.id, "adjustment", product.minimumStock, "Contagem");
  assert.equal(service.isLowStock(product.id), true);
  const state = service.moveStock(product.id, "adjustment", 0, "Esgotamento");
  assert.equal(state.products.find(p => p.id === product.id)?.status, "out_of_stock");
});

test("persiste os dados após nova instância do serviço", () => {
  const { service, storage } = setup();
  service.createCategory({ name: "Persistida", description: "", status: "active", displayOrder: 10 });
  assert.ok(storage.getItem(CATALOG_STORAGE_KEY));
  const reloaded = new CatalogService(storage).load();
  assert.equal(reloaded.categories.some(item => item.name === "Persistida"), true);
});

test("valida nome, categoria e preços", () => {
  const { service } = setup();
  const base = { name: "", description: "", categoryId: "", price: -1, trackStock: true, currentStock: 0, minimumStock: 0, status: "available" };
  assert.throws(() => service.createProduct(base), /nome/);
  assert.throws(() => service.createProduct({ ...base, name: "Produto" }), /categoria/);
  assert.throws(() => service.createProduct({ ...base, name: "Produto", categoryId: service.load().categories[0].id }), /preço/);
});
