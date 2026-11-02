import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { draftSchema, ResearchCache } from './lib/city-workflow';
import {
  generateProposal,
  ModelBudget,
  ModelBudgetError,
  MODEL_CALLS_PER_DAY,
  MODEL_SOURCES_PER_RUN,
  sourceText,
  type ModelProvider,
} from './lib/city-research-model';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    provider: { type: 'string', default: 'gemini' },
    source: { type: 'string' },
    output: { type: 'string' },
  },
});
const root = process.cwd();

async function main() {
  if (!values.file) throw new Error('Supply --file research/cities/<city-state>.json.');
  if (!['gemini', 'ollama'].includes(values.provider!))
    throw new Error('Use --provider gemini or --provider ollama.');
  const provider = values.provider as ModelProvider;
  const file = path.resolve(root, values.file);
  const cityRoot = path.join(root, 'research/cities') + path.sep;
  if (!file.startsWith(cityRoot) || !file.endsWith('.json'))
    throw new Error('Keep city drafts inside research/cities/.');
  const draft = draftSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  const sources = draft.sources.filter((source) => !values.source || source.id === values.source);
  if (!sources.length)
    throw new Error('Register and fetch at least one official source before model assistance.');
  if (sources.length > MODEL_SOURCES_PER_RUN)
    throw new Error(`Choose at most ${MODEL_SOURCES_PER_RUN} sources per model-assisted run.`);

  const cacheDirectory = path.join(root, '.thrifty-data/city-research-cache');
  const cache = new ResearchCache(cacheDirectory);
  const budget = new ModelBudget(cacheDirectory);
  const results = [];
  for (const source of sources) {
    const cached = await cache.peek(source.url).catch(() => undefined);
    if (!cached?.body)
      throw new Error(`Fetch source ${source.id} with the city workflow before using a model.`);
    await budget.reserve();
    const result = await generateProposal(provider, {
      city: draft.city,
      source,
      sourceHash: cached.hash,
      sourceText: sourceText(cached.body),
    });
    results.push({
      sourceId: source.id,
      sourceUrl: source.url,
      sourceHash: cached.hash,
      ...result,
    });
  }

  const artifact = {
    version: 1,
    city: draft.city,
    generatedAt: new Date().toISOString(),
    reviewStatus: 'pending',
    warning:
      'Model extraction only. Verify every field against registered official sources, add coordinates separately, and use the normal approval workflow.',
    limits: {
      callsThisRun: budget.calls,
      callsPerRun: MODEL_SOURCES_PER_RUN,
      callsPerUTCDay: MODEL_CALLS_PER_DAY,
    },
    results,
  };
  const output = path.resolve(
    root,
    values.output || `.thrifty-data/model-proposals/${draft.city.id}.json`,
  );
  const allowedOutputRoots = [
    path.join(root, '.thrifty-data') + path.sep,
    path.join(root, 'research/proposals') + path.sep,
  ];
  if (!allowedOutputRoots.some((candidate) => output.startsWith(candidate)))
    throw new Error('Write proposals inside .thrifty-data/ or research/proposals/.');
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(artifact, null, 2) + '\n', { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        city: draft.city.id,
        provider,
        sources: results.length,
        proposedCandidates: results.reduce(
          (count, item) => count + item.proposal.candidates.length,
          0,
        ),
        output: path.relative(root, output),
        reviewStatus: 'pending',
        published: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof ModelBudgetError ? 2 : 1;
});
