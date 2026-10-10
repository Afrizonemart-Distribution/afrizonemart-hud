/**
 * Mirror of StoreEventDto in afrizonemart-api src/modules/store-game/service.ts —
 * one step of one shopper's visit, from GET /api/hud/store/stream (live)
 * or /api/hud/store/replay (a past window).
 */
export type StoreEventType =
  | 'enter'
  | 'aisle'
  | 'shelf'
  | 'search'
  | 'cart_add'
  | 'checkout'
  | 'pay_ok'
  | 'pay_fail'
  | 'error'
  | 'leave';

export interface StoreEvent {
  s: string; // visit id
  t: StoreEventType;
  p: string; // web | ios | android | server
  c?: string | null; // country
  cat?: string | null;
  prod?: string | null;
  q?: string | null;
  amt?: number | null;
  cur?: string | null;
  d?: string | null;
  at: number; // ms since epoch
}

/** Public category tree node (GET /api/categories). */
export interface CategoryNode {
  slug: string;
  name: string;
  archetype?: string;
  productCount?: number;
  children?: CategoryNode[];
}
