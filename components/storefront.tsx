"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";

import type {
  PublicCheckoutInput,
  PublicCheckoutResult,
  PublicFulfillmentType,
  PublicPaymentMethod,
  PublicStorePayload,
  PublicStoreProduct,
} from "@/lib/public-storefront-types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type CartItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  additions: string[];
  note: string;
};

type Address = {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  postalCode: string;
};

const emptyAddress: Address = {
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  postalCode: "",
};

export function Storefront({ slug }: { slug: string }) {
  const [store, setStore] = useState<PublicStorePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [confirmed, setConfirmed] = useState<PublicCheckoutResult | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setFatalError("");
      try {
        const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await response.json()) as PublicStorePayload | { error?: string };
        if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Loja indisponível.");
        setStore(body as PublicStorePayload);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setFatalError(error instanceof Error ? error.message : "Loja indisponível.");
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [slug]);

  const products = useMemo(
    () =>
      store?.products.filter(
        (product) =>
          (category === "all" || product.categoryId === category) &&
          `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [store, category, search],
  );

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addItem(product: PublicStoreProduct) {
    if (!store) return;
    if ((!store.config.open && !store.config.acceptOrdersWhenClosed) || product.status !== "available") return;
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id && !item.additions.length && !item.note);
      if (existing) {
        const nextQuantity = existing.quantity + 1;
        if (product.trackStock && nextQuantity > product.currentStock) {
          setMessage({ type: "error", text: "Quantidade acima do estoque disponível." });
          return current;
        }
        return current.map((item) =>
          item === existing ? { ...item, quantity: nextQuantity } : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.promotionalPrice ?? product.price,
          quantity: 1,
          additions: [],
          note: "",
        },
      ];
    });
    setMessage({ type: "success", text: `${product.name} adicionado ao carrinho.` });
  }

  function updateQuantity(index: number, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) return current.filter((_, itemIndex) => itemIndex !== index);
      const item = current[index];
      const product = store?.products.find((candidate) => candidate.id === item.productId);
      if (product?.trackStock && quantity > product.currentStock) {
        setMessage({ type: "error", text: "Quantidade acima do estoque disponível." });
        return current;
      }
      return current.map((candidate, itemIndex) =>
        itemIndex === index ? { ...candidate, quantity } : candidate,
      );
    });
  }

  function updateItem(index: number, patch: Partial<Pick<CartItem, "additions" | "note">>) {
    setCart((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  if (loading) {
    return (
      <div className="store-loading">
        <span className="store-logo">AO</span>
        <p>Preparando a loja...</p>
      </div>
    );
  }

  if (!store || fatalError) {
    return (
      <div className="store-loading">
        <span className="store-logo">AO</span>
        <p>{fatalError || "Loja não encontrada."}</p>
      </div>
    );
  }

  const location = [store.config.city, store.config.state].filter(Boolean).join("/");

  return (
    <div className="public-store">
      {message && (
        <div className={`store-message ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)} aria-label="Fechar mensagem">
            <X size={15} />
          </button>
        </div>
      )}

      <header className="store-top">
        <a href="#cardapio" className="store-brand">
          <span className="store-logo">{store.config.logoText}</span>
          <span>
            <strong>{store.config.name}</strong>
            <small>{store.config.tagline}</small>
          </span>
        </a>
        <button className="store-cart-button" onClick={() => setCartOpen(true)} aria-label="Abrir carrinho">
          <ShoppingBag />
          <span>{itemCount}</span>
          <strong>{money.format(subtotal)}</strong>
        </button>
      </header>

      <section className="store-cover">
        <div className="cover-pattern" />
        <div className="store-cover-copy">
          <span className="store-logo hero">{store.config.logoText}</span>
          <div>
            <p className="eyebrow">LOJA ONLINE</p>
            <h1>{store.config.coverMessage}</h1>
            <div className="store-meta">
              <span className={store.config.open ? "open" : "closed"}>
                <i /> {store.config.open ? "Aberto agora" : "Fechado"}
              </span>
              <span>
                <Clock3 /> {store.config.openingHours}
              </span>
              {location && (
                <span>
                  <MapPin /> {location}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {!store.config.open && (
        <div className="closed-banner">
          <Store />
          <span>
            <strong>Loja fechada</strong>
            <small>{store.config.closedMessage}</small>
          </span>
        </div>
      )}

      <main id="cardapio" className="store-content">
        <section className="store-toolbar">
          <label>
            <Search />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produtos" />
          </label>
          <nav aria-label="Categorias">
            <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>Todos</button>
            {store.categories.map((item) => (
              <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>
                {item.name}
              </button>
            ))}
          </nav>
        </section>

        {products.length === 0 ? (
          <div className="store-empty">
            <Search />
            <h2>Nenhum produto encontrado</h2>
            <p>Tente outra busca ou categoria.</p>
          </div>
        ) : (
          <section className="store-products">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                companyName={store.config.name}
                disabled={!store.config.open && !store.config.acceptOrdersWhenClosed}
                onAdd={() => addItem(product)}
              />
            ))}
          </section>
        )}
      </main>

      <footer className="store-footer">
        <span className="store-logo">{store.config.logoText}</span>
        <p>{store.config.name} · Loja criada com ATTUAL ONE</p>
      </footer>

      {cart.length > 0 && (
        <button className="mobile-cart-bar" onClick={() => setCartOpen(true)}>
          <span>{itemCount} itens</span>
          <strong>Ver carrinho · {money.format(subtotal)}</strong>
        </button>
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          subtotal={subtotal}
          onClose={() => setCartOpen(false)}
          onQuantity={updateQuantity}
          onItem={updateItem}
          onClear={() => setCart([])}
          onCheckout={() => {
            setCartOpen(false);
            setCheckout(true);
          }}
        />
      )}

      {checkout && (
        <CheckoutModal
          slug={slug}
          store={store}
          cart={cart}
          subtotal={subtotal}
          onClose={() => setCheckout(false)}
          onConfirmed={(order) => {
            setCheckout(false);
            setCart([]);
            setConfirmed(order);
          }}
        />
      )}

      {confirmed && <Confirmation order={confirmed} slug={slug} onClose={() => setConfirmed(null)} />}
    </div>
  );
}

function ProductCard({ product, companyName, disabled, onAdd }: {
  product: PublicStoreProduct;
  companyName: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  const unavailable = product.status !== "available" || disabled;
  return (
    <article className={`store-product-card ${unavailable ? "unavailable" : ""}`}>
      <div className="store-product-photo">
        {product.imageUrl ? (
          <span style={{ backgroundImage: `url(${product.imageUrl})` }} />
        ) : (
          <span className="food-placeholder">
            {product.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
          </span>
        )}
        {product.promotionalPrice !== undefined && <em>OFERTA</em>}
        {product.status === "out_of_stock" && <b>ESGOTADO</b>}
      </div>
      <div className="store-product-info">
        <small>{companyName}</small>
        <h2>{product.name}</h2>
        <p>{product.description}</p>
        <div>
          <span>
            {product.promotionalPrice !== undefined && <del>{money.format(product.price)}</del>}
            <strong>{money.format(product.promotionalPrice ?? product.price)}</strong>
          </span>
          <button onClick={onAdd} disabled={unavailable} aria-label={`Adicionar ${product.name}`}>
            <Plus />
          </button>
        </div>
      </div>
    </article>
  );
}

function CartDrawer({ cart, subtotal, onClose, onQuantity, onItem, onClear, onCheckout }: {
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onQuantity: (index: number, quantity: number) => void;
  onItem: (index: number, patch: Partial<Pick<CartItem, "additions" | "note">>) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <div className="store-overlay">
      <aside className="cart-drawer" role="dialog" aria-modal="true">
        <header>
          <div><p className="eyebrow">SEU PEDIDO</p><h2>Carrinho</h2></div>
          <button onClick={onClose} aria-label="Fechar carrinho"><X /></button>
        </header>
        <div className="cart-items">
          {cart.map((item, index) => (
            <article key={`${item.productId}-${index}`}>
              <div>
                <strong>{item.productName}</strong>
                <input
                  value={item.additions.join(", ")}
                  placeholder="Adicionais (separe por vírgula)"
                  onChange={(event) => onItem(index, {
                    additions: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
                  })}
                />
                <input
                  value={item.note}
                  maxLength={500}
                  placeholder="Alguma observação?"
                  onChange={(event) => onItem(index, { note: event.target.value })}
                />
              </div>
              <div className="cart-item-bottom">
                <span className="qty">
                  <button onClick={() => onQuantity(index, item.quantity - 1)}><Minus /></button>
                  <b>{item.quantity}</b>
                  <button onClick={() => onQuantity(index, item.quantity + 1)}><Plus /></button>
                </span>
                <strong>{money.format(item.unitPrice * item.quantity)}</strong>
              </div>
            </article>
          ))}
        </div>
        <div className="cart-summary">
          <span>Subtotal <strong>{money.format(subtotal)}</strong></span>
          <span className="total">Total parcial <strong>{money.format(subtotal)}</strong></span>
          <button className="store-primary" disabled={!cart.length} onClick={onCheckout}>
            Continuar para o checkout <ChevronRight />
          </button>
          <button className="clear-cart" onClick={onClear}>Limpar carrinho</button>
        </div>
      </aside>
    </div>
  );
}

function CheckoutModal({ slug, store, cart, subtotal, onClose, onConfirmed }: {
  slug: string;
  store: PublicStorePayload;
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onConfirmed: (order: PublicCheckoutResult) => void;
}) {
  const [identified, setIdentified] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<PublicFulfillmentType>("pickup");
  const [address, setAddress] = useState<Address>({ ...emptyAddress, city: store.config.city });
  const [payment, setPayment] = useState<PublicPaymentMethod>("pix");
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());
  const fee = fulfillment === "delivery" ? store.config.deliveryFee : 0;

  async function submit() {
    if (sending) return;
    setSending(true);
    setError("");

    const input: PublicCheckoutInput = {
      submissionId,
      identified,
      name,
      phone,
      fulfillment,
      address: fulfillment === "delivery" ? address : undefined,
      paymentMethod: payment,
      couponCode: coupon.trim() || undefined,
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        additions: item.additions,
        note: item.note,
      })),
    };

    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as { order?: PublicCheckoutResult; error?: string };
      if (!response.ok || !body.order) throw new Error(body.error || "Não foi possível concluir o pedido.");
      onConfirmed(body.order);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível concluir o pedido.");
      setSending(false);
    }
  }

  return (
    <div className="store-overlay checkout-overlay">
      <section className="checkout-modal">
        <header>
          <button onClick={onClose}><ArrowLeft /></button>
          <div><p className="eyebrow">ÚLTIMA ETAPA</p><h2>Finalizar pedido</h2></div>
        </header>
        <div className="checkout-body">
          <section>
            <h3>Identificação</h3>
            <label className="anonymous-check">
              <input type="checkbox" checked={!identified} onChange={(event) => setIdentified(!event.target.checked)} />
              Comprar sem identificação
            </label>
            {identified && (
              <div className="checkout-grid">
                <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              </div>
            )}
          </section>
          <section>
            <h3>Como você quer receber?</h3>
            <div className="checkout-options">
              {[["pickup", "Retirada"], ["delivery", "Entrega"], ["dine_in", "Consumo local"]].map(([value, label]) => (
                <button key={value} className={fulfillment === value ? "active" : ""} onClick={() => setFulfillment(value as PublicFulfillmentType)}>{label}</button>
              ))}
            </div>
            {fulfillment === "delivery" && (
              <div className="checkout-grid address">
                <label>Rua<input value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} /></label>
                <label>Número<input value={address.number} onChange={(event) => setAddress({ ...address, number: event.target.value })} /></label>
                <label>Bairro<input value={address.district} onChange={(event) => setAddress({ ...address, district: event.target.value })} /></label>
                <label>Complemento<input value={address.complement} onChange={(event) => setAddress({ ...address, complement: event.target.value })} /></label>
              </div>
            )}
          </section>
          <section>
            <h3>Pagamento</h3>
            <div className="checkout-options">
              {[["pix", "Pix"], ["cash", "Dinheiro"], ["credit_card", "Crédito"], ["debit_card", "Débito"]].map(([value, label]) => (
                <button key={value} className={payment === value ? "active" : ""} onClick={() => setPayment(value as PublicPaymentMethod)}>{label}</button>
              ))}
            </div>
          </section>
          <section>
            <h3>Cupom</h3>
            <div className="coupon-input">
              <input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Digite o código" />
            </div>
            <small>O desconto é validado no servidor ao confirmar o pedido.</small>
          </section>
          {error && <div className="checkout-error">{error}</div>}
        </div>
        <footer>
          <div>
            <span>Subtotal <b>{money.format(subtotal)}</b></span>
            <span>Entrega <b>{money.format(fee)}</b></span>
            <span className="total">Total antes do cupom <b>{money.format(subtotal + fee)}</b></span>
          </div>
          <button className="store-primary" disabled={sending || !cart.length} onClick={() => void submit()}>
            {sending ? "Enviando..." : "Confirmar pedido"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Confirmation({ order, slug, onClose }: { order: PublicCheckoutResult; slug: string; onClose: () => void }) {
  const trackingHref = order.trackingToken
    ? `/loja/${encodeURIComponent(slug)}/rastreamento/${encodeURIComponent(order.trackingToken)}`
    : null;

  return (
    <div className="store-overlay confirmation-overlay">
      <section className="confirmation">
        <span className="confirmation-check"><Check /></span>
        <p className="eyebrow">PEDIDO CONFIRMADO</p>
        <h1>Obrigado pelo pedido!</h1>
        <p>Seu pedido <strong>#{order.number}</strong> foi recebido.</p>
        <div className="confirmation-total">
          {order.discount > 0 && <span>Desconto: -{money.format(order.discount)}</span>}
          <strong>{money.format(order.total)}</strong>
        </div>
        <div className="timeline">
          <div className="done"><i><Check /></i><span>Pedido recebido</span></div>
          <div><i>2</i><span>Aguardando confirmação</span></div>
          <div><i>3</i><span>Preparação</span></div>
          <div><i>4</i><span>Concluído</span></div>
        </div>
        {order.fulfillment === "delivery" && trackingHref && (
          <a className="store-primary" href={trackingHref} style={{ marginBottom: 8 }}>
            Acompanhar minha entrega <ChevronRight />
          </a>
        )}
        <button className="store-primary" onClick={onClose}>Voltar à loja</button>
      </section>
    </div>
  );
}
