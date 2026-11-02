# Boulder-area directory — November 1, 2026

Status: **review complete; ten listings published in the repository** after the November 2 metro expansion. Coverage includes Boulder and nearby Louisville/Lafayette/Broomfield within the 20 km city radius. Deployment status and the live checks are reported with the release delivery; local publication alone does not deploy the site.

| Category           | Approved listings                                                                                 | Count |
| ------------------ | ------------------------------------------------------------------------------------------------- | ----: |
| Thrift             | arc Louisville; arc Broomfield; Pig + Pearl; Greenwood Wildlife Thrift Shop & Consignment Gallery |     4 |
| Farmers markets    | Boulder Farmers Market; Lafayette Farmers Market; Louisville Farmers Market                       |     3 |
| Vintage / antiques | Classic Facets; Little Horse Vintage Louisville; Noble Treasures Antiques                         |     3 |

The evidence and stable IDs are in [the city plan](boulder-co.json). The published snapshot is [data/cities/boulder-co.json](../../data/cities/boulder-co.json); the generated registry includes Boulder automatically. In the app, choose **Boulder, CO · directory ready** from the city selector. The API lookup is `/api/places?lat=40.01&lng=-105.265`.

## Review decisions

- arc’s cached locator identifies Louisville as retail plus donations and provides its pin. Its hours remain unknown. Donation-only arc Lafayette is excluded.
- Pig + Pearl and Greenwood’s operator pages support their Boulder retail addresses and shopping hours. These pages are now cached. Census address matches supply approximate pins, with state, municipality, street, house number and direction reviewed.
- Boulder Farmers Market’s organizer page gives the Saturday season, April 4–November 21, 2026, 8am–2pm, and a venue pin in its map link. The map camera center was not used. Wednesday sessions are not counted as a separate venue; that season ended October 7. Service animals only.
- Lafayette’s organizer gives Sundays May 3–October 25, 2026, 9am–1pm, on Public Road between Cleveland and Geneseo. Its visitor page links to the named Google location at 100 N Public Road; the matching Census result provides an approximate public reference point for the street market. Season ended; this is not a year-round storefront or curbside pickup listing.
- Louisville’s organizer gives Saturdays May 9–October 10, 2026, 9am–1pm, on Front Street. The business association supplies the 824 Front Street address and named market pin. Season ended. Do not substitute the organizer’s one-off Lafayette harvest festival for this market.
- Little Horse’s operator text and the current Louisville Downtown Business Association directory agree on 820 Main Street. Its conflicting embedded Boulder map is rejected. The Census address-based pin agrees with the association’s named shop pin within about 38 m. Hidden hours and legacy pandemic text do not support hours; none are published. Confirm the entrance and schedule before traveling.
- Classic Facets’ current operator page supports its 942 Pearl Street address, antique/vintage jewelry category and hours. Its published directions destination provides the approximate storefront pin.
- Noble Treasures’ operator page supports its Lafayette antiques retail address and hours. A matching Census result provides its approximate pin. It replaces the unconfirmed Garage Sale Vintage lead.
- Garage Sale Vintage’s current canonical site lists Denver and Nashville, not Boulder. This does not prove the old Boulder shop is closed, but it does not support publishing it. Old articles and the visitor-map lead were insufficient and the candidate was removed.

CLI blocking/limits were not bypassed: Boulder Farmers Market and Classic Facets were reviewed through the web reader after the earlier 403/429 responses; Noble Treasures exceeded the CLI payload limit and was reviewed through the web reader. The Lafayette organizer’s map link required a focused browser review. No repeated automated retries, broad crawl, paid place lookup, AI identification or cloud scans were used.

## Parameters and usage

At the user’s request, [research/limits.json](../limits.json) now allows **8 web searches, 24 source-page accesses, 20 HTTP requests per command and 60 HTTP requests per UTC day**. The CLI enforces HTTP budgets; the research prompt governs separate search/page access. Seven-day source reuse, year-long geocode reuse, failure cooldowns, private-source rejection and the factual publication gates remain in place.

The original pass stopped at its then-current two-search/six-page ceiling with one approved and eight pending records (commit `1cb69b4`). This explicit follow-up increased the settings and resumed the saved plan without deleting or resetting its cache or ledger.

Second-pass usage:

- **8 explicit web search queries**, followed by focused official/organizer-linked page reviews.
- **17 source-page access attempts** counted conservatively, including a redirect destination, blocked map-link attempts and the organizer-linked browser views; repeated offline cache inspection does not add network requests.
- **11 CLI research requests**: six source fetch attempts and five address geocodes.
- **18 / 60** requests in the saved UTC-day ledger, including the seven requests already recorded before this pass.
- Existing arc, Lafayette, Real Farmers Market and Little Horse source bodies reused locally.
- Paid AI / Places / Vision calls: **0**. Normal Codex reasoning and search allowances still apply.

## Validation and remaining limits

Offline publication validation and all-city data checks pass: Boulder has three records per launch category; Denver retains its existing 15 records. Validation passed **66 logic/API tests, the production build, compiled-server startup, 30 desktop/mobile browser tests, formatting and diff checks**. Boulder tests cover city selection, all three categories, source/review dates, ended-market labels, directions and layout width. The expanded-budget regression preserves earlier ledger usage and blocks both run and daily overages.

This remains a reviewed directory, not live stock, prices, verified open-now status, vendor attendance or public seller publishing. No 2027 market dates were inferred. arc Louisville and Little Horse hours remain unconfirmed. Reviews become overdue after 30 days; source reachability or cache reuse never renews the review date automatically. Future passes should recheck changed or overdue sources and preserve the existing budget ledger.
