import { denverCatalogue, categoryCounts } from '../src/lib/catalogue';
import { placeFreshness } from '../src/lib/discovery';
const counts = categoryCounts();
if (['thrift', 'market', 'vintage'].some((kind) => counts[kind] < 3))
  throw new Error('Each launch category needs at least three sourced listings.');
console.log(
  JSON.stringify(
    {
      region: denverCatalogue.region,
      reviewedAt: denverCatalogue.reviewedAt,
      total: denverCatalogue.places.length,
      categories: counts,
      reviewOverdue: denverCatalogue.places.filter((p) =>
        placeFreshness(p).startsWith('Review overdue'),
      ).length,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--online')) {
  const urls = [
    ...new Set(
      denverCatalogue.places.flatMap((p) => [p.sourceUrl, ...(p.additionalSourceUrls ?? [])]),
    ),
  ];
  let failures = 0;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Thrifty directory maintenance (https://worklifelm.com)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.arrayBuffer();
      console.log(
        JSON.stringify({
          url,
          status: 'reachable',
          note: 'Reachability does not renew the review date or validate individual facts.',
        }),
      );
    } catch (e) {
      failures++;
      console.log(
        JSON.stringify({
          url,
          status: 'needs-review',
          error: e instanceof Error ? e.message : 'unavailable',
        }),
      );
    }
  }
  if (failures) process.exitCode = 1;
}
