# Architecture and integration boundary

## Components

```text
Camera / file picker
        ↓
React PWA → manual review → device workspace (version 1, validated)
    │             ├─ household goals / owned-item matching
    │             ├─ merchant inventory / self-reported sale history
    │             └─ local draft → text export → manual marketplace listing
    │
    └─ explicit cloud opt-in → same-origin Node API
                                   ├─ Google Vision labels + OCR
                                   ├─ Azure Vision tags + read
                                   └─ safe manual fallback
```

`src/lib/model.ts` defines shared data schemas and identifiers. `scoring.ts` contains pure evidence filtering, net-profit and score functions. `marketplaces.ts` defines channel suggestions and the adapter contract. Components hold scan-session state; the workspace holds durable metadata. `storage.ts` validates saved/imported records and reports storage failures.

`server/app.ts` is independently testable. It caps body/image sizes, verifies image signatures, rejects cross-site API requests, provides a bounded in-memory rate limiter, and serves the built app. `server/vision.ts` owns outbound provider requests, a 15-second timeout, endpoint restrictions and response normalization. Secrets never enter Vite client variables or response bodies. The server does not accept user-specified outbound URLs.

The server binds to loopback by default and is not a multi-tenant service. Authentication is required before shared/public cloud API use. Rate limits are per process and do not survive a restart. Image magic bytes check format, not complete image decoding or malware inspection.

## Price model

All money is entered and displayed in USD. Range = min/max of eligible sold comparables. Starting ask = channel median, or blended median when no channel evidence exists. A 3% weekly markdown starts after the first complete week beyond 30 inventory days, capped at 15%.

```text
net(p) = p × (1 − fee% / 100) − fixed fee − shipping − handling − purchase − repairs
profit floor = (purchase + repairs + shipping + handling + fixed fee + target profit)
               / (1 − fee% / 100)
suggested ask = ceil(max(age-adjusted sold median, profit floor))
```

A profit floor above the market estimate is flagged; it does not establish demand. Shipping is seller cost, not buyer-collected shipping. Taxes, returns, discounts and other unentered expenses are excluded. The app exposes planning assumptions instead of embedding supposedly current platform fee tables. Sample data always carries fictional provenance and uses the demo's current date solely for demonstration. User-entered data is not independently verified. Scores are transparent heuristics, not calibrated probability, authentication, appraisal or guaranteed sale price.

Merchant score weights profit (up to 45), margin (15), condition (15), shop focus (15), and history (10; neutral 5 with none). Only non-demo sales matching category and source store enter history; a win meets the current target net profit. Household scores combine category, size, budget, color, theme, urgency, duplicate and condition penalties; a size mismatch caps the score at 45. Goal purpose is retained for the user to assess; free text is not semantically evaluated by AI. Explicit goal attributes, not profile preferences, drive matching.

## Marketplace adapters

The typed `MarketplaceAdapter` exposes connection capabilities, publish, update price and sync. Every shipped adapter is disconnected. Writes return `NOT_CONNECTED`; sync throws. Server write routes return 409 and can never claim a listing was created. Draft IDs and item IDs are local identifiers, never external listing IDs.

To implement one real marketplace:

1. Register and obtain marketplace access. Implement seller OAuth with PKCE/state where required, refresh/revocation, per-user token encryption and minimal scopes on the server.
2. Add required category, condition, policy, shipping, location, media and product attribute mapping. A local title/description/price is not a complete platform payload.
3. Validate before publication and use an idempotency key bound to merchant, local item, channel and operation. Record an external ID only after a confirmed API response. Reconcile unknown timeouts before retrying.
4. Fetch or ingest explicitly licensed comparable evidence with source, kind, timestamp, condition, currency and identity matching. Asking inventory is not sold evidence. Do not scrape or substitute demo values for missing feeds.
5. Implement verified webhooks/order polling, sold-item reconciliation, quantity changes and delisting across connected channels to prevent overselling.
6. Introduce a durable queue for approved repricing with min/max bounds, preview, audit history, retries/backoff, and rate limits. Local suggestions do not count as scheduled dynamic repricing.
7. Verify sandbox and authorized live behavior before changing connection status or enabling publish/reprice in the UI.

References: [eBay Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html), [eBay OAuth](https://developer.ebay.com/develop/guides/sell/authorization), [Etsy authentication](https://developer.etsy.com/documentation/essentials/authentication/), [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql), [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/).

## Offline and schema evolution

The production build generates a versioned precache with bundled CSS/JavaScript/fonts, icons, manifest and HTML. Navigations use network first with cached shell fallback; precached assets use cache first. Requests to `/api` and unknown files are untouched. Old caches with the Thrifty prefix are removed on activation. Service-worker updates wait for explicit reload. Cloud calls remain online-only, while manual assessment, local inventories, drafts and exports work offline after the shell is cached.

Workspace JSON has an explicit `version: 1`. Unsupported/corrupt saved data is not overwritten automatically. Imports validate shapes, bounds, unique IDs and linked records before replacing state, with explicit user confirmation. A future migration must validate the old version, transform it, preserve a backup and validate the new version before writing. Local storage is small and synchronous; a larger deployment should migrate metadata/media to IndexedDB and optional authenticated sync with conflict handling. Multiple simultaneously edited tabs currently use last-write-wins and have no conflict UI.
