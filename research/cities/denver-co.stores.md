# Denver store refresh — November 1, 2026

Completed the requested stores-only refresh with the expanded workflow limits. The maintained `data/denver-places.json` now has **17 venues: 10 thrift, 4 markets and 3 vintage/antique shops**. Existing market records and their review dates were retained rather than automatically renewed.

Five registered operator sources were fetched: arc’s public store JSON (explicit refresh), Goodwill’s Colorado locator, Boss Vintage’s contact page, Goldmine Vintage’s location page and Antiques Etc.’s contact page. The arc payload hash was unchanged from the earlier cached review. Addresses and retail designation remain supported; donation-only stations were excluded. arc Central Park at 7485 E Iliff Avenue and arc Pecos at 1405 Cortez Street were added with the operator’s published pins. Shopping hours remain unknown for arc listings.

The Goodwill source distinguishes Archer’s daily 9am–10pm shopping from Central Park’s Monday–Saturday 9am–9pm / Sunday 9am–8pm. Vintage-store hours were checked against the current operator pages. Goldmine’s suite 102 was added to its existing 227 N Broadway address; its street-address pin remains approximate. Existing public pin provenance was preserved; no geocoding was needed for this refresh.

Evidence is staged in [denver-co.stores.json](denver-co.stores.json). It is intentionally a stores-only review, not a nine-record new-city publication plan. Denver’s original maintained catalogue follows its existing documented direct-review path; the city publisher intentionally refuses to overwrite it.

Usage: **0 web searches, 5 CLI source requests, 0 geocodes, 0 paid AI/Places/Vision calls**. The same sources and venue records were reused for nearby cities. The shared ledger was preserved. This review does not establish live stock or open-now status. Registry/data checks, tests and production build are part of the release validation.
