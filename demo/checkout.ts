import type { BackendState, Row } from '../src/core/types';

export interface CartItem {
  productId: string;
  qty: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
}

export interface Receipt {
  cartId: string;
  total: number;
  lines: Array<{ productId: string; name: string; qty: number; subtotal: number }>;
}

/**
 * Compute a cart total against the current backend state. Throws when a cart
 * line references a product that is missing from `products` — a data-dependent
 * bug that only surfaces for the exact data shape that triggers it.
 */
export function checkout(state: BackendState, cart: Cart): Receipt {
  const products = new Map<string, Row>();
  for (const p of state.tables.products ?? []) products.set(String(p.id), p);

  const lines = cart.items.map((item) => {
    const product = products.get(item.productId);
    if (!product) {
      throw new Error(`Cart ${cart.id} references missing product ${item.productId}`);
    }
    return {
      productId: String(product.id),
      name: String(product.name),
      qty: item.qty,
      subtotal: Number(product.price) * item.qty,
    };
  });

  return { cartId: cart.id, total: lines.reduce((sum, l) => sum + l.subtotal, 0), lines };
}
