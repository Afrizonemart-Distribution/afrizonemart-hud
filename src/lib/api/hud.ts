import { apiFetchAuthed } from './client';

export interface SearchTraceStage {
  name: string;
  durationMs: number;
  detail: Record<string, unknown>;
}

export interface SearchTraceResult {
  query: string;
  normalizedQuery: string;
  script: string;
  stages: SearchTraceStage[];
  totalDurationMs: number;
  resultCount: number;
  usedFallback: boolean;
  didYouMean: string | null;
}

export function fetchSearchTrace(q: string): Promise<SearchTraceResult> {
  return apiFetchAuthed<SearchTraceResult>(
    `/api/admin/hud/search-trace?q=${encodeURIComponent(q)}`,
  );
}

export interface RecentOrder {
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  shipCity: string;
  shipCountry: string;
  createdAt: string;
}

export function fetchRecentOrders(limit = 8): Promise<{ items: RecentOrder[] }> {
  return apiFetchAuthed<{ items: RecentOrder[] }>(`/api/admin/hud/recent-orders?limit=${limit}`);
}

export interface OrderJourneyStage {
  status: string;
  reached: boolean;
  current: boolean;
  enteredAt: string | null;
  durationMs: number | null;
}

export interface OrderJourneyResult {
  orderNumber: string;
  status: string;
  offRamp: 'CANCELLED' | 'REFUNDED' | null;
  createdAt: string;
  total: number;
  currency: string;
  shipCity: string;
  shipCountry: string;
  customerName: string;
  stages: OrderJourneyStage[];
  totalElapsedMs: number;
}

export function fetchOrderJourney(orderNumber: string): Promise<OrderJourneyResult> {
  return apiFetchAuthed<OrderJourneyResult>(
    `/api/admin/hud/order-journey?orderNumber=${encodeURIComponent(orderNumber)}`,
  );
}
