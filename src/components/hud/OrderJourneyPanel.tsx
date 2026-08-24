'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CreditCard,
  Package,
  PackageCheck,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchOrderJourney,
  fetchRecentOrders,
  type OrderJourneyResult,
  type OrderJourneyStage,
  type RecentOrder,
} from '@/lib/api/hud';
import { HttpApiError } from '@/lib/api/client';
import { formatDuration, formatMoney } from '@/lib/format';

const STAGE_ICON: Record<string, LucideIcon> = {
  PENDING_PAYMENT: ShoppingCart,
  PAID: CreditCard,
  FULFILLING: Package,
  SHIPPED: Truck,
  OUT_FOR_DELIVERY: Truck,
  DELIVERED: PackageCheck,
};

const STAGE_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Placed',
  PAID: 'Paid',
  FULFILLING: 'Fulfilling',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
};

function TrackNode({ stage }: { stage: OrderJourneyStage }) {
  const Icon = STAGE_ICON[stage.status] ?? Package;
  const tone = stage.current ? 'current' : stage.reached ? 'reached' : 'pending';

  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <div className="flex w-full items-center">
        <div className="flex-1" />
        <div className="relative flex flex-col items-center">
          {stage.current && (
            <span className="absolute inline-flex h-12 w-12 animate-ping rounded-full bg-amber/40" />
          )}
          <span
            className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all ${
              tone === 'reached'
                ? 'border-amber bg-amber/15 text-amber shadow-glow-sm'
                : tone === 'current'
                  ? 'border-amber bg-amber text-navy shadow-glow'
                  : 'border-amber/20 bg-void text-amber/25'
            }`}
          >
            {tone === 'reached' ? <Check size={18} aria-hidden /> : <Icon size={18} aria-hidden />}
          </span>
        </div>
        <div className="flex-1" />
      </div>
      <div className="text-center">
        <p
          className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
            tone === 'pending' ? 'text-amber/30' : 'text-amber text-glow'
          }`}
        >
          {STAGE_LABEL[stage.status] ?? stage.status}
        </p>
        {stage.durationMs !== null && (
          <p className="mt-0.5 font-mono text-[10px] text-info">
            {stage.current ? '+' : ''}
            {formatDuration(stage.durationMs)}
          </p>
        )}
      </div>
    </div>
  );
}

export function OrderJourneyPanel() {
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [journey, setJourney] = useState<OrderJourneyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentOrders(8)
      .then((r) => {
        setRecent(r.items);
        if (r.items[0]) void loadJourney(r.items[0].orderNumber);
      })
      .catch((err) => setError(err instanceof HttpApiError ? err.message : 'Failed to load orders.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJourney = async (orderNumber: string) => {
    setSelected(orderNumber);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOrderJourney(orderNumber);
      setJourney(result);
    } catch (err) {
      setError(err instanceof HttpApiError ? err.message : 'Trace failed.');
      setJourney(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Quick-pick strip */}
      <div className="flex flex-wrap gap-2">
        {recent.map((o) => (
          <button
            key={o.orderNumber}
            type="button"
            onClick={() => loadJourney(o.orderNumber)}
            className={`rounded border px-3 py-1.5 font-mono text-[11px] transition-all ${
              selected === o.orderNumber
                ? 'border-amber bg-amber/15 text-amber shadow-glow-sm'
                : 'border-amber/20 text-amber/50 hover:border-amber/40 hover:text-amber'
            }`}
          >
            {o.orderNumber}
          </button>
        ))}
      </div>

      {error && (
        <div className="hud-corners hud-panel flex items-center gap-3 border-danger/40 p-4 text-danger">
          <AlertTriangle size={16} aria-hidden />
          <span className="font-mono text-xs">{error}</span>
        </div>
      )}

      {loading && !journey && (
        <div className="hud-corners hud-panel p-8 text-center font-mono text-xs uppercase tracking-widest text-amber/40 animate-blink">
          Tracing…
        </div>
      )}

      {journey && (
        <>
          {/* Order summary strip */}
          <div className="hud-corners hud-panel grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Readout label="Order" value={journey.orderNumber} />
            <Readout label="Customer" value={journey.customerName} />
            <Readout label="Total" value={formatMoney(journey.total, journey.currency)} />
            <Readout label="Route" value={`${journey.shipCity}, ${journey.shipCountry}`} />
          </div>

          {journey.offRamp && (
            <div className="hud-corners hud-panel flex items-center gap-3 border-danger/40 p-4">
              <Ban size={16} aria-hidden className="text-danger" />
              <span className="font-mono text-xs uppercase tracking-widest text-danger">
                Journey ended — {journey.offRamp}
              </span>
            </div>
          )}

          {/* The track — the central visualization */}
          <div className="hud-corners hud-panel p-6">
            <div className="relative flex items-start">
              {/* Connecting line, behind the nodes */}
              <div className="absolute left-0 right-0 top-6 -z-0 mx-6 h-0.5 bg-amber/15">
                <div
                  className="h-full bg-amber/60 shadow-glow-sm transition-all duration-700"
                  style={{
                    width: `${(journey.stages.filter((s) => s.reached).length / journey.stages.length) * 100}%`,
                  }}
                />
              </div>
              {journey.stages.map((stage) => (
                <TrackNode key={stage.status} stage={stage} />
              ))}
            </div>
          </div>

          <div className="font-mono text-[11px] text-amber/40">
            total elapsed — {formatDuration(journey.totalElapsedMs)}
          </div>
        </>
      )}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <span className="font-mono text-[10px] uppercase tracking-widest text-amber/40">{label}</span>
      <span className="truncate font-mono text-sm font-bold text-amber text-glow">{value}</span>
    </div>
  );
}
