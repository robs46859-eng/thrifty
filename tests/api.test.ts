import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { configuredProvider, identify } from '../server/vision';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=';
describe('identification API', () => {
  it('reports a manual-only runtime without disclosing config', async () => {
    const response = await request(createApp()).get('/api/status');
    expect(response.status).toBe(200);
    expect(response.body.identification).toBe('manual');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('never calls a cloud provider without explicit photo consent', async () => {
    const cloud = vi.fn();
    const response = await request(
      createApp({ provider: 'google', googleKey: 'secret-test-key' }, cloud),
    )
      .post('/api/identify')
      .send({ image: png });
    expect(response.body.provider).toBe('manual');
    expect(response.body.labels).toEqual([]);
    expect(cloud).not.toHaveBeenCalled();
  });
  it('gives honest manual fallback when credentials are absent', async () => {
    const response = await request(createApp())
      .post('/api/identify')
      .send({ image: png, useCloud: true });
    expect(response.body.provider).toBe('manual');
    expect(response.body.confidence).toBeNull();
    expect(response.body.suggestion).toBe('');
  });
  it('rejects malformed images and disguised file contents', async () => {
    expect(
      (
        await request(createApp())
          .post('/api/identify')
          .send({ image: 'data:image/png;base64,SGVsbG8gd29ybGQgaW52YWxpZA==' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(createApp())
          .post('/api/identify')
          .send({ image: 'https://example.com/image.jpg' })
      ).status,
    ).toBe(400);
  });
  it('blocks cross-origin requests and bounds request frequency', async () => {
    expect(
      (
        await request(createApp())
          .post('/api/identify')
          .set('Origin', 'https://attacker.example')
          .send({ image: png })
      ).status,
    ).toBe(403);
    const app = createApp();
    for (let i = 0; i < 12; i++) await request(app).post('/api/identify').send({ image: png });
    expect((await request(app).post('/api/identify').send({ image: png })).status).toBe(429);
  });
  it('parses Google labels and OCR without treating brand or size as verified', async () => {
    const cloud = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          responses: [
            {
              labelAnnotations: [{ description: 'Jacket', score: 0.91 }],
              fullTextAnnotation: { text: 'M cotton' },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const response = await request(
      createApp({ provider: 'google', googleKey: 'secret-test-key' }, cloud),
    )
      .post('/api/identify')
      .send({ image: png, useCloud: true });
    expect(response.body.provider).toBe('google');
    expect(response.body.suggestion).toBe('Jacket');
    expect(response.body.text).toBe('M cotton');
    expect(response.body.message).toContain('Confirm');
    expect(JSON.stringify(response.body)).not.toContain('secret-test-key');
    expect(cloud.mock.calls[0][0]).toBe('https://vision.googleapis.com/v1/images:annotate');
  });
  it('parses Azure tags and text and constrains configured endpoints', async () => {
    expect(
      configuredProvider({
        provider: 'azure',
        azureKey: 'secret',
        azureEndpoint: 'https://attacker.example',
      }),
    ).toBe('manual');
    const cloud = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tagsResult: { values: [{ name: 'furniture', confidence: 0.8 }] },
          readResult: { blocks: [{ lines: [{ text: 'Made in USA' }] }] },
        }),
        { status: 200 },
      ),
    );
    const result = await identify(
      Buffer.from('image'),
      {
        provider: 'azure',
        azureKey: 'secret',
        azureEndpoint: 'https://test.cognitiveservices.azure.com',
      },
      cloud,
    );
    expect(result.labels).toEqual(['furniture']);
    expect(result.text).toBe('Made in USA');
    expect(result.provider).toBe('azure');
  });
  it('handles provider rejection, timeout and malformed data with a safe fallback', async () => {
    for (const cloud of [
      vi.fn().mockResolvedValue(new Response('secret upstream message', { status: 401 })),
      vi.fn().mockRejectedValue(new Error('timeout')),
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    ]) {
      const result = await identify(
        Buffer.from('image'),
        { provider: 'google', googleKey: 'secret-test-key' },
        cloud,
      );
      expect(result.provider).toBe('manual');
      expect(result.message).not.toContain('secret');
      expect(result.suggestion).toBe('');
    }
  });
});
it('marketplace endpoints never claim to publish or reprice', async () => {
  const app = createApp();
  const status = await request(app).get('/api/marketplaces');
  expect(status.body.every((m: { status: string }) => m.status === 'disconnected')).toBe(true);
  for (const action of ['publish', 'reprice']) {
    const response = await request(app)
      .post(`/api/marketplaces/ebay/${action}`)
      .send({ price: 20 });
    expect(response.status).toBe(409);
    expect(response.body.ok).toBe(false);
  }
  expect((await request(app).get('/api/nonexistent')).status).toBe(404);
});

it('identifies the deployed service and redirects the www alias to the configured origin', async () => {
  const app = createApp({}, fetch, 'https://worklifelm.com');
  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body.service).toBe('thrifty');
  expect(health.headers['cache-control']).toBe('no-store');
  const alias = await request(app).get('/?from=www').set('Host', 'www.worklifelm.com');
  expect(alias.status).toBe(308);
  expect(alias.headers.location).toBe('https://worklifelm.com/?from=www');
  const status = await request(app).get('/api/status').set('Origin', 'https://worklifelm.com');
  expect(status.status).toBe(200);
  expect(
    (
      await request(app)
        .post('/api/identify')
        .set('Origin', 'https://other.example')
        .send({ image: png })
    ).status,
  ).toBe(403);
});
