/**
 * Shared shapes for the HUD's teaching layer: hover explanations and the
 * Advisor bar. Every HUD page (Arcade, Order Journey, Search, World) builds
 * its own explanations + advice in these shapes and renders them with the
 * common <Explain>/<AdvisorPanel> components.
 */

export type Level = 'good' | 'watch' | 'bad' | 'info';

export interface Explanation<C = unknown> {
  title: string;
  what: string;
  /** what it's doing right now, from the page's live data */
  now?: (ctx: C) => { text: string; level: Level } | null;
  /** what good / watch / bad looks like */
  scale?: string;
}

export type Severity = 'red' | 'yellow' | 'green';

export interface Tip {
  id: string;
  severity: Severity;
  title: string;
  happening: string;
  doThis: string[];
}

export interface Advice {
  overall: Severity;
  headline: string;
  /** optional progress meter (capacity, on-time delivery, conversion…) */
  meter?: {
    label: string;
    pct: number | null;
    left: string;
    right: string;
    note?: string;
    explainKey?: string;
    mark?: number;
    /** 'low' (default): a fuller bar is worse (load, lateness). 'high': fuller is better (conversion). */
    goodWhen?: 'low' | 'high';
  };
  tips: Tip[];
}
