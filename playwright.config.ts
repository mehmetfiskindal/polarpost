import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    viewport: { width: 390, height: 844 },
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: 'npm run build -- --outDir dist/e2e && vite preview --outDir dist/e2e --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
  },
})
