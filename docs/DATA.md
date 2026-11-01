# Real Denver directory

Thrifty's default map now contains **15 real Denver-area places in three populated categories**. Data is maintained in `data/denver-places.json` and reviewed against the public sources below on **November 1, 2026**. These are source-reviewed directory records, not live stock, prices, ratings, attendance or independently audited businesses.

| Category           | Places | Primary sources                                                                                                                                                                                                                                           |
| ------------------ | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thrift stores      |      8 | [arc Thrift locations](https://arcthrift.com/stores), [Goodwill of Colorado](https://goodwillcolorado.org/shop/locations/)                                                                                                                                |
| Farmers markets    |      4 | [South Pearl Street](https://www.southpearlstreet.com/farmers-market/), [City Park](https://www.cityparkfarmersmarket.com/), [Highlands](https://thehighlandsfarmersmarket.com/), [Cherry Creek Fresh Market](https://www.coloradofreshmarkets.com/visit) |
| Vintage & antiques |      3 | [Boss Vintage](https://www.bossvintage.com/contact), [Goldmine Vintage](https://www.goldminevintage.com/home-blend), [Antiques Etc.](https://www.denverantiques.com/contact)                                                                              |

The thrift category contains six arc retail/outlet locations (Alameda, Arvada Plaza, Bear Valley, Broadway, Colfax and JCRS) and two Goodwill retail locations (Archer and Central Park). Donation-only stations are excluded.

## Coordinates and provenance

Each record includes an official source URL and label, a `checkedAt` date, a coordinate note and, where applicable, the geocoding source URL. arc coordinates come from its [public store directory](https://arcthrift.com/ajax/get-store-list); the Highlands market pin comes from the organizer's map link. Other address-based pins use the [U.S. Census address geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html). Address-derived pins are approximate, not surveyed entrances. Cherry Creek’s venue-area pin uses coordinates from the [adjacent Macy’s official location page](https://www.macys.com/stores/co/denver/cherry-creek-shopping-center_344.html); the organizer provides the actual market entrance instructions. The geocoder’s mismatched street-direction result was rejected. Public directions use venue names and published addresses so an approximate pin is not represented as an exact entrance.

Official records use `source: official`; they are not relabeled as OpenStreetMap results. Existing `osm`, `sample` and `draft` backup records remain supported. Sample places cannot be routed as real destinations. Official and OSM places can share a trip, with per-record provenance retained.

## Season and freshness rules

Denver markets retain their published season start/end dates in `America/Denver`; other published cities use their own configured US timezone. On November 1, 2026, City Park and Highlands have ended their 2026 seasons, South Pearl is within its listed season through November 8, and Cherry Creek's official visit page advertises its next season starting May 1, 2027. The app shows expired/current-season/future labels and the actual published hours. Being within a listed season is not an open-now claim. Weather cancellations and vendor attendance must be checked with the organizer.

Records display their review date and are marked **Review overdue** after 30 days. Fetching the app or requesting the API never renews a review date. HTTP reachability alone also never renews it. A server cache or successful build does not certify current opening hours.

## Availability

The default view loads the real directory bundled with the app. `GET /api/places?lat=39.75&lng=-104.99` serves the same source-reviewed data within 20 km of the requested center, returning per-category counts, source name, review date, coverage description and fetch timestamp. No AI credentials or third-party place request is required for these Denver records. A current snapshot is preserved even when an official website temporarily rejects automated requests. Source freshness remains visible.

Outside coverage, the existing bounded best-effort OpenStreetMap/Overpass lookup remains available; a failure returns honest coverage/retry guidance. There is no automatic substitution of fictional places or distant Denver places as nearby results. Sample mode is available explicitly from the map information dialog or `/?demo=1`.

After the PWA's initial successful online load, the bundled directory and local map tools can reopen offline. Background map tiles and wider-area discovery still need internet. Saving and trip planning remain device-local; this work does not publish private seller drafts or enable live marketplace listings.

## Maintaining and expanding the data

For new cities, use [the US city workflow](CITY_WORKFLOW.md). Its shared cache and request budgets also apply to the online source checker. The original Denver records remain in this file; newly approved city datasets live under `data/cities/`.

```sh
npm run data:check
npm run data:check -- --online
```

The first command validates record shapes, IDs, dates, source requirements and at least three records in each launch category. It reports category totals and overdue reviews. The optional online mode reuses seven-day cached source results and uses at most six requests per command / twelve per UTC day across the shared research cache. New source failures exit nonzero for review; budget exhaustion exits with a deferred status. It reports cached versus fresh checks explicitly. It does not scrape new assertions, change dates or write data automatically. One source (South Pearl) returned 403 to the command-line checker during this release; its official page and schedule were readable through web research. Other listed source pages returned successful responses.

To update or add a listing:

1. Read its official shop/organizer page. Confirm name, retail category, current address, published hours and season dates where relevant. Avoid donation-only locations and discontinued or moving addresses without confirmation.
2. Obtain public-source coordinates or an address geocode; retain the source and an honest precision note. Preserve a record's stable ID when updating it.
3. Edit `data/denver-places.json`. Set that record's `checkedAt` only after reviewing its facts. Update the catalogue review date only when the complete catalogue has been reviewed; records still carry their own dates.
4. Run data validation, tests and build, then commit/push through the existing deployment flow. `scripts/build-server.mjs` includes data files in the source fingerprint and bundles the catalogue into the production server.

There is no scheduled background refresh in this release. This is an expandable launch directory; nationwide coverage, licensed real-time feeds, commercial map tiles and seller-owned public listings require additional work.
