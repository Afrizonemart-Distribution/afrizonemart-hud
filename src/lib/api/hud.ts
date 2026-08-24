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
