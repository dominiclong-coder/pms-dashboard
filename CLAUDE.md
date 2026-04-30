# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start local dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run fetch-data   # Bulk-fetch all registrations from API → Firebase (requires API_TOKEN env var)
npm run sync-shipbob # Import ShipBob daily purchase volume CSV into Firebase
```

Scripts are run directly with tsx (no compilation step):
```bash
npx tsx scripts/check-firebase.ts   # Inspect Firebase record counts
npx tsx scripts/import-lot-csv.ts   # One-off lot data import
```

## Environment

One required env var:
```
NEXT_PUBLIC_API_TOKEN=  # MyProductCares API token (Shopify Admin > Apps > My Product Registration > Settings > API Access)
```

Firebase credentials are hardcoded in `lib/firebase.ts` (public Firestore API key — intentional for this internal tool). Firestore rules allow public reads and writes until March 2027.

Deployment: Vercel auto-deploys from the `main` branch. Set `NEXT_PUBLIC_API_TOKEN` in Vercel environment variables.

## Architecture

### Data flow

All data originates from two places:
1. **Firebase Firestore** — the persistent store, loaded on page mount via `loadStaticData()` in `lib/client-api.ts`
2. **MyProductCares API** (`https://product-reg.varify.xyz/api`) — the upstream source, fetched on demand via the Refresh/Full Sync buttons

On load: Firebase → `loadStaticData()` → `warrantyRegistrations` / `returnRegistrations` state in `app/page.tsx` → passed as props to all charts.

On refresh: API → gap detection in `fetchNewestRegistrations()` → `saveToFirebase()` → state update.

Purchase volumes (manually entered by the user) are stored separately in Firestore at `purchase-volumes/current` and loaded via `loadPurchaseVolumes()`.

### Key files

| File | Role |
|------|------|
| `app/page.tsx` | Single page — owns all state, orchestrates data loading, refresh logic, and renders all charts |
| `lib/types.ts` | Canonical type definitions (`Registration`, `PurchaseVolume`, `CohortDataPoint`, etc.) |
| `lib/analytics.ts` | All computation — filtering, cohort survival, daily launch tracker, claims-over-time grouping |
| `lib/firebase.ts` | Firestore read/write helpers; collections: `warranty-claims`, `return-claims`, `metadata`, `purchase-volumes` |
| `lib/client-api.ts` | API pagination, gap detection, and refresh logic |
| `components/Filters.tsx` | Shared `DropdownMultiSelect` component used by multiple charts |
| `scripts/fetch-data.ts` | Bulk sync script (full rewrite of Firebase from API) |

### API pagination quirk

The MyProductCares API at `limit=100` silently drops the ~100 most recent records. The workaround is a two-phase refresh in `fetchNewestRegistrations()`:
1. **Bulk scan** (limit=100, up to 500 pages) — covers historical records
2. **Fast scan** (limit=2, capped at 100 pages in full-scan mode) — catches the most recent records the bulk scan misses

Gap detection compares `result.total` from the API against the Firebase record count. If the gap exceeds 100, a full scan runs; otherwise only the fast scan.

### Product and lot identification

Product type is resolved in `getProductType(reg)` — serial number lookup first (`LOT_TO_PRODUCT` map in `analytics.ts`), then product name string matching. The serial number is more reliable because product name fields were not consistently populated from March 2026 onwards.

Lot is derived from `reg.serialNumbers[0]` via `getLotFromRegistration()`. Format: `YYYYMM-PRODUCT` (e.g. `202601-DP2`, `202503-DPP`). Lots starting with `2022`/`2023`/`2024` predate lot tracking and return `null`. The `LOT_TO_PRODUCT` map in `analytics.ts` must be updated whenever a new production lot ships.

### Cohort survival analysis (`calculateCohortSurvival`)

Produces the heatmap in `CohortChartWithControls`. For each purchase-month cohort, it calculates the cumulative claim rate at each month offset (0, 1, 2 ... up to 12 for warranty, 1 for returns).

- Only counts warranty claims from valid purchase channels: `"Shop App"`, `"Zima Dental Website"`, `"Zima Dental Website or Shop App"`.
- Valid exposure window: warranty 0–365 days, return 0–31 days.
- Purchase volumes are stored monthly per product/lot and prorated when a cohort window doesn't align to month boundaries.

### Daily launch tracker (`calculateDailyLaunchSurvival`)

Produces the line chart in `DailyLaunchChartWithControls`. Compares named series (product + lot + start date) by cumulative claim rate over days since launch.

For Day N on the x-axis:
- `cohortCutoffStr = min(startDate + N days, today)`
- **Denominator** (cohort size): purchases in `[startDate, cohortCutoffStr]`
- **Numerator** (claims): of those purchases, claims with `claimDate ≤ cohortCutoffStr`

This is a snapshot metric — both purchases and claims are scoped to the first N days of the launch window.

### Purchase volume modal

`PurchaseVolumeModal` lets users enter monthly purchase counts per product per lot, with optional daily breakdowns. Saved to `purchase-volumes/current` in Firestore as a single document with a `volumes[]` array. When `dailyCounts` is present on a `PurchaseVolume` entry, it takes precedence over the monthly total for date-level calculations.
