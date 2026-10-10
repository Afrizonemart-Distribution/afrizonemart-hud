import type { SearchStats } from '@/lib/api/adminSearch';
import type { Advice, Explanation, Tip } from './advice';

/**
 * Search & Discovery teaching layer: plain-English hover explanations for
 * every panel and an Advisor that turns the numbers into jobs (add these
 * products, add these synonyms, fix slow search).
 */

const pc = (n: number) => `${(n * 100).toFixed(1)}%`;

export const SEARCH_EXPLAIN: Record<string, Explanation<SearchStats>> = {
  total: {
    title: 'Searches',
    what: 'How many times people typed something into the search box (website + app) in this window.',
    now: (s) => ({ text: `${s.totalQueries.toLocaleString()} searches.`, level: 'info' }),
  },
  zero: {
    title: 'Zero-result rate',
    what: 'Searches that showed “nothing found”. Each one is a customer who wanted something and left empty-handed.',
    now: (s) => ({ text: `${pc(s.zeroResultRate)} of searches found nothing (${s.zeroResultQueries.toLocaleString()}).`, level: s.zeroResultRate >= 0.2 ? 'bad' : s.zeroResultRate >= 0.1 ? 'watch' : 'good' }),
    scale: 'Good: under 10%. Over 20% means many shoppers can’t find what they came for.',
  },
  fallback: {
    title: 'Fallback rate',
    what: 'Searches where the exact words found nothing, so search loosened up (fuzzy matching on spelling) to find something close.',
    now: (s) => ({ text: `${pc(s.fallbackRate)} needed fuzzy matching.`, level: s.fallbackRate >= 0.3 ? 'watch' : 'good' }),
    scale: 'High means people spell things differently from your product names — add synonyms.',
  },
  dym: {
    title: 'Did-you-mean rate',
    what: 'Searches where we suggested a corrected spelling (“Did you mean garri?”).',
    now: (s) => ({ text: `${pc(s.didYouMeanRate)} got a spelling suggestion.`, level: 'info' }),
  },
  latency: {
    title: 'Search speed',
    what: 'How long search took to answer. p50 = a typical search, p95 = the slow 1-in-20.',
    now: (s) => (s.latencyMs ? { text: `typical ${s.latencyMs.p50} ms · slow 1-in-20 ${s.latencyMs.p95} ms`, level: s.latencyMs.p95 >= 500 ? 'bad' : s.latencyMs.p95 >= 250 ? 'watch' : 'good' } : null),
    scale: 'Good: slow 1-in-20 under 250 ms. Over 500 ms feels laggy as you type.',
  },
  zeroList: {
    title: 'Top zero-result queries',
    what: 'The exact words people searched that found nothing — a shopping list of products to source, or words to teach search (synonyms).',
  },
  top: { title: 'Top queries', what: 'What people search for most. These should all find great results — make sure they’re in stock and well photographed.' },
  script: { title: 'Query script mix', what: 'Which writing system people search in (Latin letters, Arabic, etc.). Helps decide which languages to support.' },
  volume: { title: 'Search volume', what: 'Searches per day (or hour). Spikes usually follow a promo, a post, or a newsletter.' },
  countries: { title: 'Searches by country', what: 'Where searches come from — useful for deciding which countries to stock and ship to.' },
  live: { title: 'Live search activity', what: 'Every search pulses on the globe in real time, at the searcher’s country.' },
};

export function adviseSearch(s: SearchStats | null): Advice {
  if (!s) return { overall: 'green', headline: 'Loading search…', tips: [] };
  const tips: Tip[] = [];
  if (s.totalQueries >= 20 && s.zeroResultRate >= 0.1) {
    const list = s.topZeroResultQueries.slice(0, 5).map((q) => `“${q.normalizedQuery}” (${q.count}×)`).join(', ');
    tips.push({
      id: 'zero',
      severity: s.zeroResultRate >= 0.2 ? 'red' : 'yellow',
      title: `${pc(s.zeroResultRate)} of searches find nothing`,
      happening: `${s.zeroResultQueries.toLocaleString()} searches came up empty. Most common: ${list || '—'}.`,
      doThis: [
        'If we sell it under another name, add the shopper’s word to that product’s name or description in Admin → Products (cheapest, minutes) — or ask the dev team to add a search synonym (there’s no admin screen for synonyms yet).',
        'If we don’t sell it, pass the list to the sourcing team — these are proven demand.',
        'Check spelling variants (e.g. “gari” vs “garri”) and add both to the product name or tags.',
      ],
    });
  }
  if (s.totalQueries >= 20 && s.fallbackRate >= 0.3) {
    tips.push({
      id: 'fallback',
      severity: 'yellow',
      title: 'People search with different words from your product names',
      happening: `${pc(s.fallbackRate)} of searches only matched after fuzzy spelling correction.`,
      doThis: ['Look at the top queries and add the shoppers’ own words to product names / descriptions (or ask the dev team for synonyms).', 'Use local names in product titles (e.g. “ogbono” alongside “wild mango seed”).'],
    });
  }
  if (s.latencyMs && s.latencyMs.p95 >= 250) {
    tips.push({
      id: 'slow',
      severity: s.latencyMs.p95 >= 500 ? 'red' : 'yellow',
      title: 'Search is slow',
      happening: `The slow 1-in-20 search takes ${s.latencyMs.p95} ms (typical ${s.latencyMs.p50} ms).`,
      doThis: [
        'Check the Backend Arcade → Advisor: if the API or database is busy, fix that first.',
        'Ask the dev team to check the search index is being used (EXPLAIN on the search query).',
        'If it’s autocomplete that feels slow, its 1-second cache (MICRO_CACHE_TTL_MS) can be raised.',
      ],
    });
  }
  const order = { red: 0, yellow: 1, green: 2 };
  tips.sort((a, b) => order[a.severity] - order[b.severity]);
  const found = 1 - s.zeroResultRate;
  return {
    overall: tips.some((t) => t.severity === 'red') ? 'red' : tips.length ? 'yellow' : 'green',
    headline: s.totalQueries < 20 ? 'Not many searches yet — advice gets better with more traffic.' : tips.length ? `${tips.length} way${tips.length === 1 ? '' : 's'} to help shoppers find things.` : 'Search is healthy — shoppers are finding what they look for.',
    meter: {
      label: 'Found something',
      pct: Math.round(found * 100),
      left: `FOUND · ${pc(found)} of searches showed results`,
      right: 'aim for 90%+',
      explainKey: 'zero',
      goodWhen: 'high',
    },
    tips,
  };
}
