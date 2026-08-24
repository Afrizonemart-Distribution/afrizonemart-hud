'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Overview' },
  { href: '/order-journey', label: 'Order Journey' },
  { href: '/search', label: 'Search & Discovery' },
];

/**
 * One page per algorithm system, each free to adopt its own reference
 * visual language, plus Overview as the "everything, live, at once"
 * hologram. Simple route tabs — this will grow one entry per system
 * as each gets its own visualization built and pushed here.
 */
export function HudNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-amber/10 px-6 pt-3">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-t border-b-2 px-3 pb-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
              active
                ? 'border-amber text-amber text-glow'
                : 'border-transparent text-amber/40 hover:text-amber/70'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
