import type { Identification } from '../src/lib/model';
export type VisionConfig = {
  provider?: string;
  googleKey?: string;
  azureKey?: string;
  azureEndpoint?: string;
};
export function configuredProvider(config: VisionConfig) {
  if (config.provider === 'google' && config.googleKey) return 'google';
  if (config.provider === 'azure' && config.azureKey && config.azureEndpoint) {
    try {
      const url = new URL(config.azureEndpoint);
      if (
        url.protocol === 'https:' &&
        /\.(cognitiveservices\.azure\.com|api\.cognitive\.microsoft\.com)$/.test(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port
      )
        return 'azure';
    } catch {
      /* stay manual */
    }
  }
  return 'manual';
}
export function fallback(
  message = 'Cloud identification is not configured. Add the label details below to assess your find.',
  configured = false,
): Identification {
  return {
    provider: 'manual',
    configured,
    message,
    labels: [],
    text: '',
    confidence: null,
    suggestion: '',
  };
}
export async function identify(
  image: Buffer,
  config: VisionConfig,
  fetcher: typeof fetch = fetch,
): Promise<Identification> {
  const provider = configuredProvider(config);
  if (provider === 'manual') return fallback();
  try {
    let response: Response;
    if (provider === 'google') {
      response = await fetcher('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googleKey! },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 8 },
                { type: 'TEXT_DETECTION', maxResults: 5 },
              ],
            },
          ],
        }),
      });
    } else {
      const endpoint = new URL('/computervision/imageanalysis:analyze', config.azureEndpoint);
      endpoint.search = 'api-version=2024-02-01&features=tags,read';
      response = await fetcher(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/octet-stream',
          'Ocp-Apim-Subscription-Key': config.azureKey!,
        },
        body: new Uint8Array(image),
      });
    }
    if (!response.ok) throw new Error('Provider rejected request');
    const body = await response.json();
    const result = provider === 'google' ? body.responses?.[0] : body;
    if (!result || result.error) throw new Error('Provider returned no result');
    const labels: string[] =
      (provider === 'google'
        ? result.labelAnnotations?.map((l: { description: string }) => l.description)
        : result.tagsResult?.values?.map((l: { name: string }) => l.name)) ?? [];
    const text: string =
      provider === 'google'
        ? (result.fullTextAnnotation?.text ?? '')
        : (result.readResult?.blocks ?? [])
            .flatMap((b: { lines: { text: string }[] }) => b.lines?.map((l) => l.text) ?? [])
            .join('\n');
    const confidence =
      provider === 'google'
        ? result.labelAnnotations?.[0]?.score
        : result.tagsResult?.values?.[0]?.confidence;
    return {
      provider,
      configured: true,
      message:
        'Image labels and visible text are suggestions. Confirm the item, brand, size, condition and price yourself.',
      labels: labels.slice(0, 8).map(String),
      text: String(text).slice(0, 2000),
      confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : null,
      suggestion: String(labels[0] ?? '').slice(0, 120),
    };
  } catch {
    return fallback(
      'Cloud analysis could not complete. Your image is ready for manual identification; try again later.',
      true,
    );
  }
}
export function validImage(buffer: Buffer, mime: string) {
  return (
    (mime === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (mime === 'image/png' &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === 'image/webp' &&
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP')
  );
}
