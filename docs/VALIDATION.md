# Validation record

Validated locally on October 28, 2026.

| Check                            | Result                                            |
| -------------------------------- | ------------------------------------------------- |
| Domain, storage and API tests    | 25 passed                                         |
| Production build / TypeScript    | Passed; versioned offline shell generated         |
| Desktop Chrome browser workflows | 5 passed                                          |
| Pixel 7 emulation in Chrome      | 5 passed                                          |
| Offline reload and local save    | Passed in both browser configurations             |
| Responsive overflow checks       | Passed on all five screens in both configurations |
| Formatting and whitespace        | Passed                                            |
| Dependency audit                 | No reported vulnerabilities                       |

The browser workflows exercise review-gated saves, inventory persistence, local listing drafts, text export, self-reported sale recording, uploaded photos without invented AI results, manual comparables, child profile/goal creation and persistence, offline use, and nine disconnected marketplace states. The layouts were also inspected in desktop and phone screenshots.

Google/Azure parsing, consent defaults, missing credentials, provider rejection/timeouts, malformed results, image validation, cross-origin rejection, rate limiting, and marketplace write rejection are tested with local requests and mocked provider responses. No credentialed provider or real marketplace account was contacted. Camera hardware capture, iOS installation, real marketplace publishing, live comparable feeds, background repricing, and production hosting remain unverified/unimplemented as described in the README.

A GitHub Actions workflow runs formatting, the same tests, the build, and browser workflows on pushes and pull requests. This local record alone does not claim that a remote CI run has passed.
