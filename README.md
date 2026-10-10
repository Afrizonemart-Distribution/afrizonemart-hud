# Afrizonemart HUD

Live, HUD-style visualization of Afrizonemart's algorithm systems
(search, recommendations, pricing, and whatever else lands in
`ALGORITHM_SYSTEMS_TRACKER.md`) — a diagnostic console for watching a
real algorithm's pipeline execute stage by stage, not a metrics
dashboard.

**Separate repo, same backend.** Mirrors `afrizonemart-mobile` and
`afrizonemart-v2-supplier`: its own repo and deploy, but it talks to
the same `afrizonemart-api` backend over HTTPS (`NEXT_PUBLIC_API_URL`)
— no backend changes needed to add this. Auth is the same Bearer-token
login as every other Afrizonemart frontend, but access here is
**ADMIN role only** — stricter than the general admin console, which
also admits STAFF with a capability grant.

## How a new algorithm gets a panel

1. The algorithm's own module in `afrizonemart-api` exposes an
   ADMIN-only trace endpoint under `/api/admin/hud/*` (see
   `src/modules/hud/routes.ts` there — a routing collection point,
   never business logic itself). The endpoint runs the real pipeline
   via the same repository-layer functions production traffic uses,
   just returns per-stage timing + detail instead of the final answer.
2. This repo gets a matching panel component under `src/components/hud/`
   and a client function in `src/lib/api/hud.ts`.

Search is the first one (`SearchTracePanel.tsx`, `search-trace`
endpoint) — normalize → script detection → synonym expansion →
lexical search → trigram fallback → facets → did-you-mean, each stage
lighting up with its own timing and detail as it completes.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind. Dark "console" theme
(brand navy background, brand amber as the glow color) rather than the
storefront's light theme — deliberately, this reads as a diagnostic
tool, not another admin page.

## Getting started

```bash
npm install
cp .env.example .env.local   # points at the real prod API by default
npm run dev
```

## Credits

3D models in `public/models/` are from Kenney's **Mini Characters** and **Mini Market** packs
(www.kenney.nl), licensed CC0. License files sit next to the models.
