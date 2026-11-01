# Boulder, CO — research pass, November 1, 2026

Status: **partial; not published**. Coverage is Boulder and nearby Louisville/Lafayette within the existing 20 km planning radius. Planning coordinates were not copied into business pins.

| Category           | Staged candidates | Approved | Remaining review                                                                                      |
| ------------------ | ----------------: | -------: | ----------------------------------------------------------------------------------------------------- |
| Thrift             |                 3 |        1 | Pig + Pearl and Greenwood need coordinate evidence                                                    |
| Farmers markets    |                 3 |        0 | All need exact public pins; Louisville needs a more precise market footprint                          |
| Vintage / antiques |                 3 |        0 | Little Horse location conflict; Classic Facets and Garage Sale need current retail addresses and pins |

The plan is [boulder-co.json](boulder-co.json). Only arc Louisville is approved. Its operator locator labels it retail plus donations and supplies coordinates. The Lafayette arc location is donation-only and was excluded. No incomplete or conflicting pin was added to the public directory.

## Sources and findings

- **arc:** reused the already-cached [operator locator](https://arcthrift.com/ajax/get-store-list) without another request. Louisville is at 1349 E South Boulder Road; its hours remain unknown.
- **Pig + Pearl / Greenwood:** official page text returned by the first web search supports the Boulder retail addresses and shopping hours. Coordinates remain unreviewed. These pages have not been fetched into the shared source cache yet.
- **Boulder Farmers Market:** official organizer text returned by the second web search supports the 2026 Saturday season, April 4–November 21, 8am–2pm, at 13th and Canyon. Direct source fetch returned HTTP 403. Saturday and Wednesday sessions were kept as one venue; the Wednesday season ended October 7. Service animals only.
- **Lafayette Farmers Market:** cached official home page supports Public Road between Cleveland and Geneseo, Sundays May 3–October 25, 2026, 9am–1pm. Season has ended. Not a curbside pickup site.
- **Louisville Farmers Market:** cached Real Farmers Market home page supports downtown Front Street, Saturdays May 9–October 10, 2026, 9am–1pm; dog friendly. Season has ended. Do not substitute the organizer's October 31 Lafayette harvest festival for a recurring farmers market.
- **Little Horse Vintage:** cached operator home page text lists 820 Main Street, Louisville, but the same location block embeds a map at 2250 Pearl Street, Boulder. Its hours block is hidden and legacy pandemic text remains. Reject the mismatched map pin; confirm current retail operation/address before approval.
- **Classic Facets:** first search returned the operator's antique/vintage jewelry description; direct fetch returned HTTP 429. Address and pin remain unknown.
- **Garage Sale Vintage:** only a lead from a downtown visitor-map search result. The guessed operator root returned HTTP 301. Operator/current Boulder location remain unconfirmed; the plan intentionally omits its address. Review the canonical destination in a later pass before any further fetch.

## Usage and stopping condition

[The workflow prompt](../../docs/CITY_RESEARCH_PROMPT.md) requires: “Use at most two web searches and six source-page reads in this pass” and “If the budget is reached, stop research, save the partial plan.” Both pass limits were reached; no extra source reads, retries, geocoding, paid AI calls or cloud scans were made.

- Web searches: **2 / 2**.
- Source fetch attempts: **6 / 6**, each through the budgeted CLI; three succeeded and three were deferred (403, 429, 301).
- Cached arc source reused locally: **0** additional network requests.
- CLI research requests this pass: **6**; daily ledger after this pass: **7 / 12**, including the earlier arc request.
- Geocoding: **0**; paid AI / Places / Vision requests: **0**.
- Offline status, schema checks, tests and build do not consume the research allowance. GitHub release operations are not source research.

## Next pass

1. Start with the offline status command and this handoff. Keep the saved ledger/cache; do not reset either to extend the allowance. A new pass is explicit follow-up work, not an automatic budget restart.
2. Next cached source to inspect: **Little Horse** (`little-horse`). Use its visible Louisville address text to resolve the conflicting embedded map. Its current operating status still needs confirmation; a Census match alone will not establish that.
3. Reuse cached `lafayette-market` and `real-markets` facts. Obtain exact organizer/public market pins and resolve Louisville's footprint. Verify the Boulder organizer pin without repeatedly retrying its blocked URL.
4. Review the vintage sources' canonical/live addresses before geocoding. Use the budgeted geocoder only where an operator pin is absent, preserving state, house-number, direction and coordinate-source evidence.
5. Publish only after three approved records in each category, all required evidence, and offline validation pass. Then run the documented release checks and verify real Boulder results. No current inventory, seller attendance, prices or open-now status have been verified.

## Validation in this pass

The city plan parses successfully. Offline status reports one approved and eight pending records. The publication gate rejects the incomplete city as expected; no `data/cities/boulder-co.json` was created and the generated catalogue registry still contains only Denver. Validation passed: 64 logic/API tests, the production build, the compiled-server startup test, the existing 15-record Denver directory check, and formatting/diff checks. Browser tests were not rerun because this pass changed only unpublished research files.
