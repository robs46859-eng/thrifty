import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

// Hash the shipped sources, not a timestamp: /api/health can identify the artifact
// even when the hosting platform checks out source without Git metadata.
async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const path = `${directory}/${entry.name}`;
        return entry.isDirectory() ? sources(path) : [path];
      }),
  );
  return files.flat();
}
const hash = createHash('sha256');
for (const file of [
  ...(await sources('src')),
  ...(await sources('server')),
  ...(await sources('public')),
  'index.html',
  'package.json',
  'package-lock.json',
  'scripts/build-sw.mjs',
  'scripts/build-server.mjs',
]) {
  hash.update(file);
  hash.update(await readFile(file));
}
const sourceId = hash.digest('hex').slice(0, 20);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await build({
  entryPoints: ['server/index.ts'],
  outfile: 'server.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  define: {
    'process.env.THRIFTY_SOURCE_ID': JSON.stringify(sourceId),
    'process.env.THRIFTY_VERSION': JSON.stringify(pkg.version),
  },
});
console.log(`Production server generated (source ${sourceId}).`);
