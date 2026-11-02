# Community updates

Open a reviewed place on Explore and choose **Share an update**. Verified Google or email sign-in is required to publish, confirm, dispute, flag or withdraw an update. Anyone can read active public updates. Reports use a generated shopper alias, never the account's email or private account ID. Do not include personal information in public text. Inventory, purchase tags and seller drafts remain private on the device; publishing a community find is a separate, explicit action.

## Report types

| Update                       | Structured information                                                     | Normal active lifetime                                |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Restock days                 | Weekdays or specific date, optional time window                            | 45 days                                               |
| Discount days                | Weekdays or specific date, optional time window                            | 14 days                                               |
| Unlisted closure / reopening | Temporary closure, permanent closure or reopened; optional applicable date | 3 days                                                |
| Holiday hours                | Specific date and hours or Closed                                          | Through the applicable date plus a short grace period |
| Category price ranges        | Category and minimum/maximum USD prices                                    | 30 days                                               |
| Store layout                 | Aisle, floor or section and text directions                                | 90 days                                               |
| Store rating                 | 1–5 stars and experience notes                                             | 180 days                                              |
| Parking                      | Parking area, restrictions, costs or advice in text                        | 30 days                                               |
| Nearby find                  | Item name, category, optional price and store area                         | 2 days                                                |
| Accessibility                | Area and observed access details                                           | 60 days                                               |

Every contribution includes an observation date and notes. Past observations reduce the lifetime; dates must be within the past 30 days and already-expired observations are rejected. Scheduled reports must apply within the next 90 days; their expiry is the applicable date plus two days at UTC midnight. The displayed expiry is authoritative. New confirmations do not extend expiry. Expired reports disappear from public feeds, map badges and averages; authors can still see and withdraw their own expired reports.

Reports are **shopper observations**, not official notices, guaranteed stock, verified purchases or an open-now service. Scheduled closure/reopening reports do not automatically mark a store closed. Ratings are Thrifty community ratings, not imported Google ratings. Each verified account contributes at most one active rating per venue; a replacement removes the previous rating from the average. No ratings or stock are fabricated or seeded.

## Map and moderation

Pins and place cards show active update signals and community rating counts. **Recent finds** and **Community updates** filter the current map results. Summaries refresh once per minute while online and visible; place feeds also have a manual refresh. These are bounded HTTP requests, not a live traffic feed. Filters apply to the current search area, not an automatic nearby inventory search.

Members can confirm or dispute others' observations, change/remove their own vote, flag inaccurate/spam/private/abusive content, and withdraw their own posts. Three distinct member flags hide an update pending review. Votes are feedback, not verification. The verified administrator can review flagged reports from each place, hide, restore or remove them. A moderation action records an audit entry and acknowledges existing flags; new flags can trigger review again. Authors cannot confirm or flag their own posts. Removed posts cannot be restored through the public interface.

Free members may publish 10 reports per UTC day and 3 per minute, plus 60 feedback interactions per hour. These limits are separate from cloud scan credits. The verified administrator is exempt. Server-side transactions enforce quotas; clients cannot choose authors or admin roles.

## Hosting and scope

Reports, votes, flags and audit entries are shared in the existing private authentication SQLite database. Idempotent table creation runs on startup. No additional API key or external service is needed beyond working sign-in and persistent private auth storage. `/api/health` and `/api/status` expose `communityStorage: "shared-sqlite"` when initialized, or `"unavailable"`; the separate `storage: "device-only"` field still refers to inventory. Back up this database consistently and protect it with the same controls as identities and sessions. Expiry hides reports; it does not erase stored report or audit records. Workspace export/reset does not export or remove shared community reports. Authors should withdraw public posts separately.

The API validates known reviewed venue IDs, fields, dates, body sizes, ownership, admin permissions, same-origin requests and CSRF tokens. Public responses omit private identity and flagger data. API responses are never cached by the service worker. If storage or sign-in is unavailable, publication stays locked and the directory remains usable. Offline publication is not queued.

The feature covers the 46 unique reviewed venues across the nine published Denver-metro city profiles. Overpass results, fictional examples and private seller pins cannot receive shared reports yet. Layout is text guidance, not an uploaded floorplan. Photos, merchant ownership verification, automatic store feeds, push notifications, social profiles and live stock synchronization are not implemented. No community report changes the reviewed directory's official hours, source-review date or coordinates.
