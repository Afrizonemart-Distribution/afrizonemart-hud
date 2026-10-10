import { FALLBACK_CATEGORIES } from './fallback';
import type { CategoryNode } from './types';
import type { ProductInfo } from './types';

/**
 * Public catalog reads for the store: the category tree (aisles) and
 * product names/categories (shelf bubbles). Public endpoints, no auth.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function loadCategories(): Promise<{ items: CategoryNode[]; fallback: boolean }> {
  try {
    const r = await fetch(`${API}/api/categories`);
    if (!r.ok) throw new Error(String(r.status));
    const body = (await r.json()) as { items: CategoryNode[] };
    if (!body.items?.length) throw new Error('empty');
    return { items: body.items, fallback: false };
  } catch {
    return { items: FALLBACK_CATEGORIES, fallback: true };
  }
}

interface ApiProduct {
  slug: string;
  name: string;
  category?: { slug: string } | null;
}

const cache = new Map<string, ProductInfo>();
const pending = new Set<string>();

/** Sync lookup for the engine; kicks off a fetch on a miss. */
export function productInfo(slug: string): ProductInfo | null {
  const hit = cache.get(slug);
  if (hit) return hit;
  if (!pending.has(slug) && /^[a-z0-9-]+$/.test(slug)) {
    pending.add(slug);
    fetch(`${API}/api/products/${slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<ApiProduct>) : null))
      .then((p) => {
        if (p) cache.set(slug, { name: p.name, categorySlug: p.category?.slug });
      })
      .catch(() => undefined);
  }
  return null;
}

/** A page of real products, for the demo shoppers to look at. */
export async function sampleProducts(): Promise<ApiProduct[]> {
  try {
    const r = await fetch(`${API}/api/products?limit=100`);
    const body = (await r.json()) as { items: ApiProduct[] };
    for (const p of body.items) cache.set(p.slug, { name: p.name, categorySlug: p.category?.slug });
    return body.items;
  } catch {
    return [];
  }
}
