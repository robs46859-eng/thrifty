import { createApp } from './app';
// Node's native env-file support avoids exposing any secret through the client build.
try {
  process.loadEnvFile('.env');
} catch {
  /* .env is optional */
}
const port = Number(process.env.PORT || 4317);
const app = createApp({
  provider: process.env.VISION_PROVIDER,
  googleKey: process.env.GOOGLE_VISION_API_KEY,
  azureKey: process.env.AZURE_VISION_KEY,
  azureEndpoint: process.env.AZURE_VISION_ENDPOINT,
});
app.listen(port, process.env.HOST || '127.0.0.1', (error?: Error) => {
  if (error) {
    console.error(
      `Thrifty could not start on port ${port}. Check whether the port is already in use.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Thrifty server: http://${process.env.HOST || '127.0.0.1'}:${port}`);
});
