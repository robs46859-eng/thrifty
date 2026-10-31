# Validation record

Validated locally on October 31, 2026, including the map-first redesign and preserved sign-in/scanning limits.

| Check                                         | Result                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Domain, storage, authentication and API tests | 51 passed                                                            |
| Production build / TypeScript                 | Passed; versioned offline shell generated                            |
| Desktop Chrome browser workflows              | 13 passed                                                            |
| Pixel 7 emulation in Chrome                   | 13 passed                                                            |
| Offline reload and local save                 | Passed in both browser configurations                                |
| Responsive overflow checks                    | Passed on map, saved, sell and existing tools in both configurations |
| Formatting and whitespace                     | Passed                                                               |
| Dependency audit                              | No reported vulnerabilities                                          |

The browser workflows exercise review-gated saves, inventory persistence, local listing drafts, text export, self-reported sale recording, uploaded photos without invented AI results, manual comparables, child profile/goal creation and persistence, offline use, and nine disconnected marketplace states. The layouts were also inspected in desktop and phone screenshots.

Google/Azure parsing, consent defaults, missing credentials, provider rejection/timeouts, malformed results, image validation, cross-origin rejection, rate limiting, and marketplace write rejection are tested with local requests and mocked provider responses. No credentialed provider or real marketplace account was contacted. Camera hardware capture, iOS installation, real marketplace publishing, live comparable feeds, background repricing, remain unverified/unimplemented by these local fixture checks. Production sign-in and email delivery require the setup and live acceptance steps in AUTHENTICATION.md.

A GitHub Actions workflow runs formatting, the same tests, the build, and browser workflows on pushes and pull requests. This local record alone does not claim that a remote CI run has passed.

The sign-in update additionally passes a compiled CommonJS server startup regression. Security checks cover verified Google signatures/audience/issuer/expiry and nonce binding, email-code ownership/expiry/replay/guess limits, secure cookies, CSRF/origin checks, sign-out revocation, free-user 10/day and 3/minute quotas, atomic concurrent reservations, durable restart persistence, exact verified admin exemption, and unavailable-store failure before provider access. Browser checks use isolated local mail/Google fixtures and verify sign-in, scan-limit feedback, account reload/sign-out, admin display, and separate local workspaces. These do not claim live OAuth consent or SMTP delivery.

Map tests cover normalization and unsafe-link rejection, category/text filtering, straight-line distance, old-backup migration, sample navigation suppression, ordered real directions, bounded cache/coalescing, invalid coordinates and honest directory failures. Browser workflows cover selectable pins, saved places and trip persistence, public-result replacement, private seller drafts, denied geolocation, mobile sheet navigation, tool access and layout overflow. Directory responses in automated tests are fixtures; they do not certify a venue or market schedule. Real public endpoint availability is checked separately and is not a CI dependency.

During local live probing, the public Overpass services timed out or rejected requests; the UI correctly retained explicit sample/error status. Public lookup needs a successful hosted probe before it can be described as verified live. Map tiles loaded successfully during visual QA.
