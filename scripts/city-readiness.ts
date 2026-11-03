import { readFile, readdir } from 'node:fs/promises';
import { draftSchema, draftStatus, publication } from './lib/city-workflow';
const reports = [];
for (const file of (await readdir('research/cities'))
  .filter((f) => /^[a-z0-9-]+-[a-z]{2}\.json$/.test(f))
  .sort()) {
  try {
    const draft = draftSchema.parse(JSON.parse(await readFile(`research/cities/${file}`, 'utf8')));
    let blockers: string[] = [];
    try {
      publication(draft);
    } catch (e) {
      blockers = [(e as Error).message];
    }
    reports.push({
      ...draftStatus(draft),
      blockers,
      pending: draft.candidates
        .filter((c) => c.review.status === 'pending')
        .map((c) => ({
          name: c.place.name,
          missing: ['address', 'lat', 'lng'].filter(
            (k) => c.place[k] === undefined || c.place[k] === '',
          ),
        })),
    });
  } catch (e) {
    reports.push({ file, blockers: [(e as Error).message] });
  }
}
console.log(JSON.stringify(reports, null, 2));
