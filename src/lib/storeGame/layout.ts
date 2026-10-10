import type { CategoryNode } from './types';

/**
 * The store floor plan, in world units (1 unit ≈ one Kenney floor tile).
 *
 *            back wall
 *   ┌──────────────────────────────────┐
 *   │ aisle  aisle  aisle  aisle  ...   │  ← one aisle per top-level category,
 *   │  ║       ║      ║      ║          │    shelves down both sides of a lane
 *   │  ║       ║      ║      ║          │
 *   │══════════ front corridor ═════════│  ← everyone walks along this
 *   │   till  till  till   [BANK]       │
 *   └─────────────── door ─────────────┘
 *
 * Walking is waypoint routing: current spot → front corridor → the lane's
 * mouth → the spot in the lane. Simple, and it reads like real shoppers.
 */

export type ShelfKind =
  | 'shelf-boxes'
  | 'shelf-bags'
  | 'freezers-standing'
  | 'freezer'
  | 'display-fruit'
  | 'display-bread';

export interface Aisle {
  slug: string;
  name: string;
  productCount: number;
  laneX: number; // x of the walking lane
  zFront: number; // lane mouth (near the corridor)
  zBack: number;
  shelves: ShelfKind[]; // one per slot, both sides
  childSlugs: string[];
}

export interface Till {
  x: number;
  z: number;
}

export interface StoreLayout {
  width: number;
  depth: number;
  aisles: Aisle[];
  tills: Till[];
  bank: { x: number; z: number };
  door: { x: number; z: number };
  corridorZ: number;
  /** subcategory/top-level slug → aisle index */
  aisleOf: Map<string, number>;
}

// Kenney mini kit, native scale: floor tile 1.0, shopper ~0.78 tall,
// shelf 0.8 wide x 0.88 tall x 0.7 deep, till 0.85 wide.
const LANE_SPACING = 3.2; // lane to lane; neighbouring shelf backs nearly touch
const SHELF_OFFSET = 0.85; // shelf centre from the lane centre
const SLOTS = 6; // shelves per side, side by side
const SLOT_DZ = 0.82;
const AISLE_LEN = SLOTS * SLOT_DZ + 1.2;

function shelvesFor(c: CategoryNode): ShelfKind[] {
  const s = `${c.slug} ${c.name}`.toLowerCase();
  let pool: ShelfKind[];
  if (/drink|beverage|juice|water|wine|beer|spirit/.test(s)) pool = ['freezers-standing', 'freezers-standing', 'freezer'];
  else if (/grocer|food|fruit|veg|spice|snack|farm|agric/.test(s)) pool = ['display-fruit', 'shelf-bags', 'display-bread', 'shelf-bags'];
  else if (/frozen|meat|fish|dairy/.test(s)) pool = ['freezer', 'freezers-standing'];
  else if (/book|library|stationer|office/.test(s)) pool = ['shelf-boxes'];
  else pool = ['shelf-boxes', 'shelf-bags'];
  return Array.from({ length: SLOTS * 2 }, (_, i) => pool[i % pool.length]);
}

export function buildLayout(categories: CategoryNode[]): StoreLayout {
  // Biggest categories first, capped so the floor stays readable.
  const tops = [...categories]
    .filter((c) => (c.productCount ?? 1) > 0)
    .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))
    .slice(0, 14);
  const n = Math.max(1, tops.length);
  const width = n * LANE_SPACING + 4;
  const x0 = -((n - 1) * LANE_SPACING) / 2;
  const corridorZ = 3;
  const aisles: Aisle[] = tops.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    productCount: c.productCount ?? 0,
    laneX: x0 + i * LANE_SPACING,
    zFront: corridorZ - 1.2,
    zBack: corridorZ - 1.2 - AISLE_LEN,
    shelves: shelvesFor(c),
    childSlugs: (c.children ?? []).map((k) => k.slug),
  }));
  const aisleOf = new Map<string, number>();
  aisles.forEach((a, i) => {
    aisleOf.set(a.slug, i);
    a.childSlugs.forEach((s) => aisleOf.set(s, i));
  });

  const tillCount = Math.min(6, Math.max(3, Math.round(n / 2)));
  const tills: Till[] = Array.from({ length: tillCount }, (_, i) => ({
    x: -((tillCount - 1) * 2.2) / 2 + i * 2.2 - 2,
    z: corridorZ + 2.2,
  }));
  return {
    width,
    depth: AISLE_LEN + 8,
    aisles,
    tills,
    bank: { x: tills[tills.length - 1].x + 3.2, z: corridorZ + 2.2 },
    door: { x: 0, z: corridorZ + 4.6 },
    corridorZ,
    aisleOf,
  };
}

/** Where on a lane a given product "lives" — stable per slug. */
export function shelfSpot(a: Aisle, key: string): { x: number; z: number; side: -1 | 1 } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const slot = Math.abs(h) % (SLOTS * 2);
  const side = slot < SLOTS ? -1 : 1;
  const k = slot % SLOTS;
  return { x: a.laneX + side * 0.28, z: slotZ(a, k), side };
}

/** Slot centres for drawing shelves (both sides of each lane). */
export function shelfSlots(a: Aisle): Array<{ x: number; z: number; side: -1 | 1; kind: ShelfKind }> {
  const out: Array<{ x: number; z: number; side: -1 | 1; kind: ShelfKind }> = [];
  for (let k = 0; k < SLOTS; k++) {
    const z = slotZ(a, k);
    out.push({ x: a.laneX - SHELF_OFFSET, z, side: -1, kind: a.shelves[k] });
    out.push({ x: a.laneX + SHELF_OFFSET, z, side: 1, kind: a.shelves[SLOTS + k] });
  }
  return out;
}

function slotZ(a: Aisle, k: number): number {
  return a.zFront - 0.6 - k * SLOT_DZ;
}

/** Fallback when /api/categories can't be reached (e.g. CORS from localhost). */
export const FALLBACK_CATEGORIES: CategoryNode[] = [
  { slug: 'groceries', name: 'Groceries', productCount: 900 },
  { slug: 'drinks', name: 'Drinks', productCount: 400 },
  { slug: 'books', name: 'Books', productCount: 992 },
  { slug: 'personal-care', name: 'Personal Care', productCount: 300 },
  { slug: 'home-essentials', name: 'Home Essentials', productCount: 250 },
  { slug: 'baby', name: 'Baby', productCount: 120 },
  { slug: 'snacks', name: 'Snacks', productCount: 200 },
  { slug: 'fashion', name: 'Fashion', productCount: 180 },
  { slug: 'art-collectibles', name: 'Art & Collectibles', productCount: 90 },
  { slug: 'office-supplies', name: 'Office Supplies', productCount: 80 },
];
