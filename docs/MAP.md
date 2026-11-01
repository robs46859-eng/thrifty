# Map-first Thrifty

Thrifty opens on Explore: an interactive Leaflet/OpenStreetMap map, with category chips, selectable pins, a nearby-place list, saved places, a trip planner, and seller drafts. Mobile uses a collapsible bottom sheet and four persistent destinations: Explore, Saved, Scan, and Sell. Desktop uses a side panel. Existing household, merchant, pricing, connections, backup and installation tools remain under **Your tools**.

## Explore

The first view loads 17 real source-reviewed Denver-area listings: 8 thrift stores, 4 farmers markets, and 3 vintage/antique shops. Each listing links to its official source and carries a review date. See [the data guide](DATA.md) for the records, coordinate provenance and update process. The fictional sample map is available only by explicitly choosing it in map information or opening `/?demo=1`. Pan/zoom, choose a city or explicitly request location to search another area. Location is never requested automatically.

Text search filters the current results by name, address, description and tags. Category filters update both list and markers. Distances are approximate straight-line miles from the granted location or last searched map center, not driving distances. Place details show the source, raw mapped hours where available, official website where available, save control, and trip control. Public markets are not necessarily farmers markets. Season-ended and future-season market labels use Denver calendar dates. No venue is labelled open now, crowded, verified, or currently selling an item without evidence.

## Public directory

`GET /api/places?lat=39.75&lng=-104.99` first serves source-reviewed official records within 20 km of the center, with category counts, coverage and actual review dates. The client also bundles this directory, so launch data does not depend on an external service at request time. Source freshness is visible and is never renewed by API access.

Outside the maintained directory, a fixed Overpass query performs best-effort lookup for second-hand, charity, antique/vintage, farm shops and public marketplaces within 8 km. The server validates and rounds the center, normalizes geometry, requires usable names/coordinates, strips unsafe website links, caps results at 200 and rejects incomplete responses. It never accepts an upstream URL from callers. Wider public markets are not necessarily farmers markets.

The public Overpass adapter has a ten-second deadline, 15-minute cache, duplicate-request coalescing, one active upstream request per process and a five-second upstream interval. These are modest launch safeguards, not a distributed commercial directory service. Outside-coverage failures return 503 with coverage guidance. A fictional or distant Denver place is never inserted as a real nearby result.

Map tiles are loaded directly by Leaflet from `tile.openstreetmap.org` with visible attribution and normal browser HTTP caching. They are not bulk-downloaded or service-worker cached. Cross-origin referrers send the origin only. Map tiles and public directory requests need internet; the local shell and saved metadata can reopen offline. Tile failures preserve access to the place list.

For sustained commercial traffic, provision a supported map tile provider and a licensed/hosted place directory; public community infrastructure has no uptime guarantee. The current directory is requested by user action, not continuously as the map moves.

References: [Leaflet](https://leafletjs.com/reference.html), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [Overpass instances and policies](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances), [OSM privacy](https://osmfoundation.org/wiki/Privacy_Policy).

## Saved places and trips

Hearts save a snapshot in the current account's browser workspace. Trips support up to eight stops, removal and moving a stop earlier. Dotted map segments show the saved stop order, not an actual road route or ETA. Public-place trips can open Google Maps for real directions; Google Maps controls road routing and waypoint support. Sample places and unpublished drafts cannot launch real-world directions or be mixed into public-place trips.

## Sellers

Sell provides a preview flow for a thrift shop, market stall, farm stand, maker or local seller. Move the map to the desired area, create a pin, enter shop/stall details and confirm the coordinates. The form defaults to the current map center. Pin data stays **private on this device**, can be saved to a trip/favorites, exported in the workspace backup and deleted. Public seller publishing, verified merchant ownership, moderation, vendor attendance, customer orders, checkout, live inventory, traffic and community reports are not implemented. A pin does not create a listing on any external marketplace.

This redesign does not modify Google/email login verification, scan quotas, AI consent or marketplace integration status. Verified `rob@virtuapet.com` remains exempt from scan quotas.

## Storage compatibility

Version 1 workspaces gain an optional `discovery` field with validated `saved`, `stops` and `sellers` arrays. Old backups receive empty arrays. Saved places/trips/drafts export with the workspace and follow the existing account-specific device keys. They do not sync between devices. Reset clears discovery data with the rest of the current workspace.

Purchase locations can be selected from reviewed map places or entered manually when scanning. They remain with the item through photo upload, inventory persistence and backups. Household and merchant cards support editing/clearing the location and opening user-requested directions. No automatic GPS capture or public purchase history is enabled. Adjacent city catalogues reuse shared venue IDs and discovery selects the nearest city profile to prevent duplicate pins or mixed city totals.
