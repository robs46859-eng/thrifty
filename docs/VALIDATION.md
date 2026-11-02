# Validation record

Validated locally on November 2, 2026, including the expanded Denver-metro directories and preserved sign-in/scanning limits.

| Check                                         | Result                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Domain, storage, authentication and API tests | 81 passed                                                            |
| Production build / TypeScript                 | Passed; versioned offline shell generated                            |
| Desktop Chrome browser workflows              | 20 passed                                                            |
| Pixel 7 emulation in Chrome                   | 20 passed                                                            |
| Offline reload and local save                 | Passed in both browser configurations                                |
| Responsive overflow checks                    | Passed on map, saved, sell and existing tools in both configurations |
| Formatting and whitespace                     | Passed                                                               |
| Dependency audit                              | No reported vulnerabilities                                          |

The browser workflows exercise review-gated saves, inventory persistence, local listing drafts, text export, self-reported sale recording, uploaded photos without invented AI results, manual comparables, child profile/goal creation and persistence, offline use, and nine disconnected marketplace states. The layouts were also inspected in desktop and phone screenshots.

Google/Azure parsing, consent defaults, missing credentials, provider rejection/timeouts, malformed results, image validation, cross-origin rejection, rate limiting, and marketplace write rejection are tested with local requests and mocked provider responses. No credentialed provider or real marketplace account was contacted. Camera hardware capture, iOS installation, real marketplace publishing, live comparable feeds, background repricing, remain unverified/unimplemented by these local fixture checks. Production sign-in and email delivery require the setup and live acceptance steps in AUTHENTICATION.md.

A GitHub Actions workflow runs formatting, the same tests, the build, and browser workflows on pushes and pull requests. This local record alone does not claim that a remote CI run has passed.

The sign-in update additionally passes a compiled CommonJS server startup regression. Security checks cover verified Google signatures/audience/issuer/expiry and nonce binding, email-code ownership/expiry/replay/guess limits, secure cookies, CSRF/origin checks, sign-out revocation, free-user 10/day and 3/minute quotas, atomic concurrent reservations, durable restart persistence, exact verified admin exemption, and unavailable-store failure before provider access. Browser checks use isolated local mail/Google fixtures and verify sign-in, scan-limit feedback, account reload/sign-out, admin display, and separate local workspaces. These do not claim live OAuth consent or SMTP delivery.

Map tests cover normalization and unsafe-link rejection, category/text filtering, straight-line distance, old-backup migration, sample navigation suppression, ordered real directions, bounded cache/coalescing, invalid coordinates and honest directory failures. Browser workflows cover selectable pins, saved places and trip persistence, public-result replacement, private seller drafts, denied geolocation, mobile sheet navigation, tool access and layout overflow. Directory responses in automated tests are fixtures; they do not certify a venue or market schedule. Real public endpoint availability is checked separately and is not a CI dependency.

The previous map release’s wider Overpass lookup timed out or rejected requests. The real Denver directory removes that dependency for launch coverage; wider-area discovery remains best effort. Map tiles loaded during visual QA.

The real-data release checks 15 official-source records (8 thrift, 4 markets, 3 vintage), evidence/ID validation, source-review age, Denver-time season boundaries, current/expired/future market status, public-source trip compatibility, API success without upstream access and backup compatibility. Both browser configurations exercise the actual launch catalogue, category counts, source/date details and address-based directions. Maintenance reachability checks succeeded for nine unique URLs; South Pearl rejected the command-line checker with 403 while its official page was readable via web research. Reachability does not automatically certify facts or update dates.

The US city workflow adds eight offline tests for cache reuse and conditional requests, persistent per-run/day budgets, failure cooldowns, payload limits, unsafe destinations/foreign plans, approval/evidence/date/state gates, isolated publication/registry generation, geocoder mismatches and non-Denver market dates. Boulder and Portland starter plans have zero approved records and are not published. A live cache exercise requested arc’s public locator once; a repeat run used zero network requests with the same hash and no paid AI calls.

## Purchase locations and south metro directories — November 1, 2026

Purchase locations now carry from a real map place into scanning, survive photo upload and item save, appear in household/merchant inventory, and can be edited or cleared. Manual store/address tags and old backups without the optional field remain supported. Tags are device-local and do not capture GPS automatically. Tests cover merchant photo flow, household search/clear, reloads, backup round-trip and invalid coordinates.

Denver’s store refresh adds arc Central Park and Pecos and rechecks the existing store pages: 17 total listings, with 10 thrift, four markets and three vintage/antique shops. Englewood and Littleton each publish nine regional listings with three in each launch category. Shared nearby Denver venues keep their original IDs; there are 37 unique physical venues across four city catalogues. Tests check city selection, category counts, duplicate protection, conflicting shared metadata and normal replacement of unshared city records.

Local validation: 70 logic/API tests, 36 desktop/mobile browser tests, production build, compiled-server startup, all-city data checks and formatting. The final phone spacing adjustment is checked again against the purchase-location browser flows. CI and hosted/API verification are reported in the release delivery. Directory checks do not establish live inventory, merchant publishing, current vendor attendance or open-now status.

Research used 20 additional CLI requests with the daily ledger preserved at 38/60. Operator relocation/closure notices and donation-only sites were excluded. Source plans and handoffs document the exact supported venues, calendar exceptions and remaining unknown hours. No paid AI, Places or Vision calls were used for directory research.

## Community observations — November 1, 2026

The community release adds eleven server/domain tests for all ten report kinds, strict input/date validation, sign-in/CSRF/body limits, public sharing without private identity leakage, per-member ratings, expiry and hidden-report exclusions, votes, distinct flags, ownership, admin moderation, atomic contribution quotas independent of scan credits, unavailable storage and database reopen persistence. Desktop and phone browser flows publish restock observations, confirm and flag from another member, moderate as admin, and publish category prices, finds and ratings with map filtering. All identities, messages and reports in these tests are isolated fixtures. No test reports are posted to production.

Community release validation: 81 domain/API tests, 40 desktop/phone browser workflows, production TypeScript/build, compiled-server startup, all-city data validation, formatting and whitespace checks passed locally. Existing sign-in protection and 10/day, 3/minute cloud scan limits remain covered. Authenticated sharing and moderation are fixture-tested; live checks do not create public test content.

## Nine-city Denver-metro expansion — November 2, 2026

The directory now publishes nine city profiles: Denver, Arvada, Aurora, Boulder, Centennial, Englewood, Lakewood, Littleton and Westminster. There are 46 unique reviewed venues across the overlapping profiles. Denver contains 20 listings; the other profiles contain 10 or 11 each, with at least three thrift, three farmers market and three vintage/antique records in every profile. Shared venues retain one exact record and physical ID.

Local validation passed 81 domain/API tests, all-city data/evidence validation, the production TypeScript/Vite/offline/server build, compiled-server startup, formatting checks, and 40 desktop/mobile Chrome workflows. Browser coverage selects all nine directory-ready cities and checks their record counts; it also caught and verified a fix that preserves four decimal places when requesting a selected city, preventing edge-of-coverage records from being dropped by coarse coordinate rounding.

The bounded research pass used eight web searches, twenty-four source-page access attempts and twelve public Census geocoder requests that failed at DNS. Failure cooldowns and the daily ledger were preserved. Accepted new coordinates came from the cached arc operator locator. No paid AI, Google Places, Vision scan or marketplace request was made. Validation does not establish live stock, merchant publishing, current vendor attendance, open-now status or production deployment.
