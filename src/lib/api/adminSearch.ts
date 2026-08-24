import { apiFetchAuthed } from './client';

export interface SearchStats {
  rangeDays: number;
  since: string;
  totalQueries: number;
  zeroResultQueries: number;
  zeroResultRate: number;
  latencyMs: { p50: number; p95: number; p99: number } | null;
  fallbackRate: number;
  didYouMeanRate: number;
  scriptDistribution: Array<{ script: string; count: number }>;
  topZeroResultQueries: Array<{ normalizedQuery: string; count: number }>;
  topQueries: Array<{ normalizedQuery: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

export interface SearchTimeseriesBucket {
  bucket: string;
  totalQueries: number;
  zeroResultQueries: number;
}

export function fetchSearchStats(days = 7): Promise<SearchStats> {
  return apiFetchAuthed<SearchStats>(`/api/admin/search/stats?days=${days}`);
}

export function fetchSearchTimeseries(bucket: 'day' | 'hour', range: number): Promise<SearchTimeseriesBucket[]> {
  return apiFetchAuthed<SearchTimeseriesBucket[]>(`/api/admin/search/timeseries?bucket=${bucket}&range=${range}`);
}
