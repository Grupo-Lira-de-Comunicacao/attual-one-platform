import type { PublicStorePayload } from "@/lib/public-storefront-types";

/**
 * Catalog extracted from photos supplied by the partner for a non-transactional
 * preview. Product availability, prices and names must be confirmed by Nathali.
 * No customer or order data from Hamburgueria 07 is reused.
 */
const categories = [
  { id: "burgers", name: "Burgers", description: "Os clássicos da Miranda’s", displayOrder: 1 },
  { id: "especiais", name: "Especiais da Casa", description: "Os destaques da cozinha", displayOrder: 2 },
  { id: "combos", name: "Combos", description: "Para dividir e aproveitar", displayOrder: 3 },
  { id: "porcoes", name: "Porções", description: "Para acompanhar", displayOrder: 4 },
  { id: "cervejas", name: "Cervejas", description: "Bebidas alcoólicas para maiores de 18 anos", displayOrder: 5 },
  { id: "sem-alcool", name: "Sem Álcool", description: "Bebidas para todos", displayOrder: 6 },
  { id: "adicionais", name: "Adicionais", description: "Do seu jeito", displayOrder: 7 },
];

const catalog: Array<[string,string,string,number,boolean?]> = [
  ["burgers", "X-Burguer", "Pão, maionese, ketchup, batata palha, hambúrguer, presunto e mussarela.", 1500],
  ["burgers", "X-Salada", "Pão, maionese, ketchup, batata palha, hambúrguer, presunto, mussarela, alface e tomate.", 1800],
  ["burgers", "X-Egg", "Pão, maionese, ketchup, batata palha, hambúrguer, presunto, mussarela, alface, tomate e ovo.", 2200],
  ["burgers", "X-Bacon", "Pão, maionese, ketchup, batata palha, hambúrguer, presunto, mussarela, alface, tomate e bacon.", 2700],
  ["burgers", "X-Calabresa", "Pão, maionese, ketchup, batata palha, hambúrguer, presunto, mussarela, alface, tomate e calabresa.", 2500],
  ["especiais", "H07", "Pão brioche, molho especial, blend 120g, mussarela, catupiry, alface, tomate e fritas.", 3690],
  ["especiais", "Explosão 07", "Pão brioche, molho especial, dois blends de 100g, cheddar em dobro, bacon em fatias, alface, tomate e fritas.", 4990],
  ["especiais", "Clássico 07", "Pão brioche, molho especial, blend 100g, mussarela, alface, tomate e fritas.", 3390],
  ["combos", "Combo I", "2 X-Tudo + 1 guaraná 1 litro.", 8090],
  ["combos", "Combo II", "2 X-Saladas + fritas + 1 refrigerante de cola em lata.", 5090],
  ["combos", "Combo III", "1 X-Egg + 1 X-Burguer + 1 guaraná 1 litro.", 4490],
  ["combos", "Combo IV", "Fritas G + calabresa M + 1 X-Burguer + refrigerante de cola 1 litro.", 5590],
  ["porcoes", "Fritas P", "Porção pequena de batatas fritas.", 1000],
  ["porcoes", "Fritas M", "Porção média de batatas fritas.", 1400],
  ["porcoes", "Fritas G", "Porção grande de batatas fritas.", 1800],
  ["porcoes", "Calabresa M", "Porção média de calabresa.", 1700],
  ["porcoes", "Porção Mista", "Fritas com calabresa.", 2600],
  ["cervejas", "Skol", "Cerveja — venda exclusiva para maiores de 18 anos.", 700, true],
  ["cervejas", "Original", "Cerveja — venda exclusiva para maiores de 18 anos.", 800, true],
  ["cervejas", "Heineken", "Cerveja — venda exclusiva para maiores de 18 anos.", 900, true],
  ["sem-alcool", "Água", "Água mineral.", 400],
  ["sem-alcool", "Caçulinha", "Refrigerante caçulinha.", 400],
  ["sem-alcool", "Refrigerante lata", "Refrigerante em lata.", 800],
  ["sem-alcool", "Refrigerante 600ml", "Refrigerante 600 ml.", 1000],
  ["sem-alcool", "Refrigerante 1L", "Refrigerante 1 litro.", 1300],
  ["adicionais", "Bacon", "Adicional de bacon.", 500],
  ["adicionais", "Catupiry", "Adicional de catupiry.", 500],
  ["adicionais", "Cheddar", "Adicional de cheddar.", 600],
];

export const mirandasDemoData: PublicStorePayload = {
  config: {
    companyId: "mirandas-demo-only",
    slug: "mirandas-point-burguer",
    name: "Miranda’s Point & Burguer",
    tagline: "Bons hambúrgueres, boas histórias.",
    logoText: "✤",
    primaryColor: "#e9b65b",
    secondaryColor: "#17100c",
    coverMessage: "Bons hambúrgueres, boas histórias.",
    open: false,
    acceptOrdersWhenClosed: false,
    openingHours: "",
    closedMessage: "Este cardápio é uma demonstração. Pedidos reais ainda não estão habilitados.",
    deliveryFee: 0,
    city: "Caçapava",
    state: "SP",
    alcoholMinAge: 18,
    pizzaConfiguratorEnabled: false,
  },
  categories,
  products: catalog.map(([categoryId,name,description,priceCents,restricted],index) => ({
    id: `mirandas-preview-${index+1}`,
    categoryId,
    name,
    description,
    price: priceCents/100,
    trackStock: false,
    currentStock: 0,
    status: "available",
    requiresAgeVerification: Boolean(restricted),
  })),
  deliveryZones: [],
};
