import { catalogues, categoryCounts } from '../src/lib/catalogue';
import { placeFreshness } from '../src/lib/discovery';
import { ResearchCache, ResearchBudgetError } from './lib/city-workflow';
import path from 'node:path';
async function main() {
  for (const city of catalogues) {
    const counts = categoryCounts(city.places);
    if (['thrift', 'market', 'vintage'].some((kind) => counts[kind] < 3))
      throw new Error(
        `${city.cityProfile.id}: each launch category needs at least three sourced listings.`,
      );
    console.log(
      JSON.stringify({
        city: city.cityProfile.id,
        region: city.region,
        reviewedAt: city.reviewedAt,
        total: city.places.length,
        categories: counts,
        reviewOverdue: city.places.filter((p) => placeFreshness(p).startsWith('Review overdue'))
          .length,
      }),
    );
  }
  if (!process.argv.includes('--online')) return;
  const cache = new ResearchCache(path.resolve('.thrifty-data/city-research-cache'));
  const urls = [
    ...new Set(
      catalogues.flatMap((c) =>
        c.places.flatMap((p) => [p.sourceUrl, ...(p.additionalSourceUrls ?? [])]),
      ),
    ),
  ];
  for (const url of urls) {
    try {
      const result = await cache.get(url, 7);
      console.log(
        JSON.stringify({
          url,
          status: result.cacheHit ? 'cached' : 'reachable',
          networkRequests: cache.requests,
          note: 'Does not renew the listing review date.',
        }),
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          url,
          status: e instanceof ResearchBudgetError ? 'budget-deferred' : 'needs-review',
          error: e instanceof Error ? e.message : 'unavailable',
        }),
      );
      if (e instanceof ResearchBudgetError) {
        process.exitCode = 2;
        break;
      }
      process.exitCode = 1;
    }
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
