import type { ReactNode } from 'react';

/**
 * Shared chrome for every tile in the Search ops dashboard grid — the
 * DataV reference's dense wall of small bordered panels, each with a
 * short uppercase label. Red-accented (ops-corners/ops-panel), not
 * the site's default amber hud-panel, per that page's own palette.
 */
export function OpsPanel({
  title,
  className = '',
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ops-corners ops-panel flex flex-col gap-2 p-3 ${className}`}>
      <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-danger/70">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  );
}
