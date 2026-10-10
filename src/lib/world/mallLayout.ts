import type { CategoryNode } from '../storeGame/types';

/**
 * Afrizonemart Mall floor plan (world units = floor tiles; a shopper is
 * ~0.78 tall). Back row of 6 shops, front row of 4 either side of the
 * grand entrance, an open atrium in between (fountain, café, lounge),
 * the Pay Point just inside the doors.
 *
 *   z=-15 ┌──────┬──────┬──────┬──────┬──────┬──────┐
 *         │ shop │ shop │ shop │ shop │ shop │ shop │   back row
 *   z=-8  └──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬───┘
 *            café        ( fountain )        lounge      atrium
 *   z=8   ┌──┴───┬──────┐ [ PAY POINT ] ┌──────┬───┴──┐
 *         │ shop │ shop │    doors      │ shop │ shop │   front row
 *   z=15  └──────┴──────┘───────────────└──────┴──────┘
 *                         plaza
 */

export const MALL = {
  halfW: 27,
  zBack: -15,
  zFront: 15,
  rowDepth: 7,
  shopW: 8,
  fountain: { x: 0, z: 0, r: 1.8 },
  cafe: { x: -15, z: 0 },
  lounge: { x: 15, z: 0 },
  entrance: { x: 0, zInside: 12.5, zOutside: 19.5 },
};

export type ShopTheme = {
  key: string;
  floor: string;
  shelves: string[]; // model urls for the wall runs
  decor: Array<{ url: string; scale?: number }>;
};

const M = (n: string) => `/models/market/${n}.glb`;
const F = (n: string) => `/models/furniture/${n}.glb`;

export function themeFor(c: CategoryNode): ShopTheme {
  const s = `${c.slug} ${c.name}`.toLowerCase();
  if (/drink|beverage|juice|water|wine|beer|spirit/.test(s))
    return { key: 'drinks', floor: '#d8ecf5', shelves: [M('freezers-standing'), F('kitchenFridgeLarge')], decor: [{ url: M('bottle-return') }, { url: M('freezer') }] };
  if (/grocer|food|fruit|veg|spice|snack|farm|agric|pantry/.test(s))
    return { key: 'grocery', floor: '#eef3dc', shelves: [M('shelf-bags'), M('shelf-boxes')], decor: [{ url: M('display-fruit') }, { url: M('display-bread') }, { url: M('display-fruit') }] };
  if (/book|library|stationer|office|education/.test(s))
    return { key: 'books', floor: '#efe3d0', shelves: [F('bookcaseOpen'), F('bookcaseClosedWide')], decor: [{ url: F('loungeChair') }, { url: F('lampRoundFloor') }, { url: F('bookcaseOpenLow') }] };
  if (/baby|kid|toy|child/.test(s))
    return { key: 'baby', floor: '#fbe3ee', shelves: [M('shelf-boxes'), F('bookcaseOpenLow')], decor: [{ url: F('bear'), scale: 1.4 }, { url: F('bear') }, { url: F('rugRound') }] };
  if (/fashion|cloth|wear|textile|ankara|shoe|bag/.test(s))
    return { key: 'fashion', floor: '#ece4f6', shelves: [F('coatRackStanding'), M('shelf-bags')], decor: [{ url: F('coatRackStanding') }, { url: F('coatRackStanding') }, { url: F('rugRectangle') }] };
  if (/electr|phone|computer|gadget|tech/.test(s))
    return { key: 'tech', floor: '#dde3ee', shelves: [M('shelf-boxes')], decor: [{ url: F('televisionModern') }, { url: F('desk') }, { url: F('computerScreen') }, { url: F('speaker') }] };
  if (/beauty|care|cosmetic|skin|hair|health/.test(s))
    return { key: 'care', floor: '#f6e9e2', shelves: [M('shelf-boxes'), F('bookcaseOpen')], decor: [{ url: F('pottedPlant') }, { url: F('sideTable') }, { url: F('plantSmall2') }] };
  if (/home|kitchen|furnit|decor|craft|art|collect/.test(s))
    return { key: 'home', floor: '#f2ead9', shelves: [F('bookcaseOpen'), M('shelf-boxes')], decor: [{ url: F('loungeDesignSofa') }, { url: F('lampSquareFloor') }, { url: F('rugRounded') }, { url: F('tableCoffee') }] };
  return { key: 'general', floor: '#ece8e0', shelves: [M('shelf-boxes'), M('shelf-bags')], decor: [{ url: F('pottedPlant') }, { url: F('cardboardBoxOpen') }] };
}

export interface Shop {
  slug: string;
  name: string;
  productCount: number;
  childSlugs: string[];
  theme: ShopTheme;
  row: 'back' | 'front';
  cx: number;
  zWall: number; // the outer (mall) wall
  zOpen: number; // the open shopfront
  /** the concourse spot just outside the shopfront */
  door: { x: number; z: number };
}

export interface MallLayout {
  shops: Shop[];
  shopOf: Map<string, number>;
  tills: Array<{ x: number; z: number }>;
}

export function buildMallLayout(categories: CategoryNode[]): MallLayout {
  const cats = [...categories]
    .filter((c) => (c.productCount ?? 1) > 0)
    .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));
  const backX = [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5];
  const frontX = [-22.5, -13.5, 13.5, 22.5];
  const slots: Array<{ row: 'back' | 'front'; cx: number }> = [
    ...backX.map((cx) => ({ row: 'back' as const, cx })),
    ...frontX.map((cx) => ({ row: 'front' as const, cx })),
  ];
  const shown = cats.slice(0, slots.length);
  const extra = cats.slice(slots.length);
  const shops: Shop[] = shown.map((c, i) => {
    const { row, cx } = slots[i];
    const back = row === 'back';
    const zWall = back ? MALL.zBack : MALL.zFront;
    const zOpen = back ? MALL.zBack + MALL.rowDepth : MALL.zFront - MALL.rowDepth;
    const isLast = i === shown.length - 1 && extra.length > 0;
    return {
      slug: c.slug,
      name: isLast ? `${c.name} + ${extra.length} more` : c.name,
      productCount: (c.productCount ?? 0) + (isLast ? extra.reduce((a, x) => a + (x.productCount ?? 0), 0) : 0),
      childSlugs: [
        ...(c.children ?? []).map((k) => k.slug),
        ...(isLast ? extra.flatMap((x) => [x.slug, ...(x.children ?? []).map((k) => k.slug)]) : []),
      ],
      theme: themeFor(c),
      row,
      cx,
      zWall,
      zOpen,
      door: { x: cx, z: back ? zOpen + 0.9 : zOpen - 0.9 },
    };
  });
  const shopOf = new Map<string, number>();
  shops.forEach((s, i) => {
    shopOf.set(s.slug, i);
    s.childSlugs.forEach((k) => shopOf.set(k, i));
  });
  const tills = [-6, -2.5, 2.5, 6].map((x) => ({ x, z: 10.8 }));
  return { shops, shopOf, tills };
}

/** Facing direction into the shop (+1 = toward -z for back row). */
export function inward(s: Shop): number {
  return s.row === 'back' ? -1 : 1;
}

/** A stable browsing spot inside a shop for a product (or anything keyed). */
export function shopSpot(s: Shop, key: string, h: number): { x: number; z: number; faceX: number; faceZ: number } {
  const dir = inward(s); // toward the back wall of the shop
  const slot = h % 10;
  if (slot < 6) {
    // along the back wall shelves
    const x = s.cx - 2.9 + (slot % 6) * 1.16;
    const z = s.zWall - dir * 1.25;
    return { x, z, faceX: x, faceZ: s.zWall };
  }
  // around the island
  const k = slot - 6;
  const x = s.cx - 1.8 + (k % 2) * 3.6;
  const z = s.zWall - dir * (k < 2 ? 2.7 : 4.6);
  return { x, z, faceX: s.cx, faceZ: z };
}
