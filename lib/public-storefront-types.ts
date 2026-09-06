export type PublicFulfillmentType = "pickup" | "delivery" | "dine_in";
export type PublicPaymentMethod = "pix" | "cash" | "credit_card" | "debit_card";

export type PublicStoreConfig = {
  companyId: string;
  slug: string;
  name: string;
  tagline: string;
  logoText: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  coverMessage: string;
  promotionNote?: string;
  open: boolean;
  acceptOrdersWhenClosed: boolean;
  openingHours: string;
  closedMessage: string;
  deliveryFee: number;
  city: string;
  state: string;
  alcoholMinAge?: number;
};

export type PublicStoreCategory = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
};

export type PublicStoreProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  imageUrl?: string;
  trackStock: boolean;
  currentStock: number;
  status: "available" | "out_of_stock";
  requiresAgeVerification?: boolean;
};

export type PublicStorePayload = {
  config: PublicStoreConfig;
  categories: PublicStoreCategory[];
  products: PublicStoreProduct[];
};

export type PublicCheckoutItem = {
  productId: string;
  quantity: number;
  additions?: string[];
  note?: string;
};

export type PublicCheckoutInput = {
  submissionId: string;
  identified: boolean;
  name?: string;
  phone?: string;
  fulfillment: PublicFulfillmentType;
  address?: {
    street: string;
    number: string;
    complement?: string;
    district?: string;
    city?: string;
    postalCode?: string;
  };
  paymentMethod: PublicPaymentMethod;
  couponCode?: string;
  ageConfirmed?: boolean;
  items: PublicCheckoutItem[];
};

export type PublicCheckoutResult = {
  id: string;
  number: number;
  total: number;
  discount: number;
  deliveryFee: number;
  status: string;
  paymentStatus: string;
  fulfillment: PublicFulfillmentType;
  createdAt: string;
  trackingToken?: string;
};
