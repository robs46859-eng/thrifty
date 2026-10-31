# Map-first Thrifty

Thrifty opens on Explore: an interactive Leaflet/OpenStreetMap map, with category chips, selectable pins, a nearby-place list, saved places, a trip planner, and seller drafts. Mobile uses a collapsible bottom sheet and four persistent destinations: Explore, Saved, Scan, and Sell. Desktop uses a side panel. Existing household, merchant, pricing, connections, backup and installation tools remain under **Your tools**.

## Explore

The first view is a clearly marked **sample map** centered on Denver. Its eight places are fictional and have no real-world directions. Choose **Load real places** or **Search this area** to replace them with public OpenStreetMap records around the current map center. Pan/zoom to any area, choose a starter city from the location selector, or explicitly request the browser's location. Location is never requested automatically or tracked in the background.

Text search filters the current results by name, address, description and tags. Category filters update both list and markers. Distances are approximate straight-line miles from the granted location or last searched map center, not driving distances. Place details show the source, raw mapped hours where available, official website where available, save control, and trip control. Public markets are not necessarily farmers markets. No venue is labelled open now, crowded, verified, or currently selling an item without evidence.

## Public directory

`GET /api/places?lat=39.753&lng=-104.99` searches an 8 km radius using a fixed Overpass query for second-hand, charity, antique/vintage, farm shops and public marketplaces. The server validates and rounds the search center to two decimal places, normalizes node/way/relation geometry, requires names and usable coordinates, strips unsafe website links, caps results at 200 and rejects incomplete upstream responses. The server never accepts an upstream URL from a caller.

The read-only directory service uses Private.coffee's public Overpass instance. It caches each rounded area for 15 minutes, coalesces duplicate in-flight requests, allows only one upstream request at a time per process and applies a five-second upstream interval. Cache entries are capped at 100. These are modest single-process launch safeguards, not a distributed commercial directory service. Public service availability and coverage are best effort. Errors return 503 with retry guidance, without returning fictional places as real results. The UI preserves explicit provenance when switching to the sample map.

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
