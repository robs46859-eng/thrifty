# Low-cost model-assisted city research

Thrifty can use a model to extract **pending proposals** from official pages already registered and cached by the city workflow. It never gives a model approval or publication authority. Source discovery, coordinates, evidence review and publication still use [CITY_WORKFLOW.md](CITY_WORKFLOW.md).

## Providers

| Provider   | Default model           | Cost boundary                                         | Where it runs                                   |
| ---------- | ----------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Gemini API | `gemini-3.5-flash-lite` | Free tier where available; otherwise usage-priced     | Local CLI or the manual GitHub Actions workflow |
| Ollama     | `qwen3:1.7b`            | No API charge; uses your own computer and electricity | Local CLI only                                  |

The assistant sends at most 12,000 characters from each cached page, processes at most six sources per command and records at most 12 model calls per UTC day in the local research ledger. Each source can yield at most eight proposals. The daily ledger is workspace-local; a fresh GitHub runner starts with a fresh ledger, so the manual workflow also limits each run to one city and six source calls but is not an account-wide daily quota. Set a provider-side budget/quota if that guarantee is required. No model call uses Google Search grounding, Google Places, Vision scan credits or the public Thrifty server.

## One-time Gemini setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). This is different from the Google Vision key and the OAuth client ID.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Name the secret `GEMINI_API_KEY` and paste the key. Do not put it in the repository, a `VITE_` variable or Hostinger.
4. Open **Actions → Prepare city research proposals → Run workflow**, choose a city, then download the seven-day proposal artifact.

The workflow has read-only repository permissions, runs only when manually dispatched, cannot commit, and does not deploy records. It first fetches only URLs registered in that city's plan. Empty plans intentionally fail until official sources have been added and reviewed.

## Free local setup

Install [Ollama](https://ollama.com/download), then pull the compact Qwen model once:

```sh
ollama pull qwen3:1.7b
npm run city:assist -- --file research/cities/portland-or.json --provider ollama
```

The local provider talks only to `127.0.0.1:11434`. Override the model with `OLLAMA_MODEL` if a reviewed local model is preferred. The app never starts or exposes Ollama on the public web server.

## Run order

For every city:

1. Register a small set of official operator, municipal or organizer URLs in the city plan.
2. Fetch them with `npm run city -- fetch --file research/cities/<city>.json`.
3. Run `npm run city:assist -- --file research/cities/<city>.json --provider gemini` (or `ollama`).
4. Review the JSON in `.thrifty-data/model-proposals/`. Copy only verified facts into the city plan as `pending` candidates.
5. Add or verify coordinates, evidence and review dates. Approve through the existing city workflow.
6. Validate, publish, test and deploy through the normal release path.

The initial queue is in `research/model-city-queue.json`: Dallas, Austin, San Antonio, Portland, Seattle, Kansas City, Phoenix and Albuquerque. “New Mexico” is represented by Albuquerque because catalogues are city-radius datasets; add Santa Fe or another New Mexico city as a separate plan when requested.

## Cost estimate

At the hard cap, a typical six-source run is designed to stay around 24,000 input tokens and 6,000 output tokens. At the published Gemini 3.5 Flash-Lite standard rates of $0.30 per million input tokens and $2.50 per million output tokens, that is roughly **$0.02 per city run**, excluding any taxes or future price changes. Eight capped runs are roughly **$0.18**. Free-tier calls are $0, but Google states free-tier content may be used to improve its products; use paid billing for confidential source material. Thrifty sends public page excerpts only.

Always check [current Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling paid usage. This repository does not create a dedicated GPU endpoint or recurring cloud bill.
