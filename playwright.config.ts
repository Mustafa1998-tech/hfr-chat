import { defineConfig } from '@playwright/test';
import path from 'node:path';

const fakeAudio = path.resolve('tests/fixtures/arabic-test.wav');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  outputDir: './tests/reports/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4200',
    browserName: 'chromium',
    headless: false,
    launchOptions: {
      slowMo: 120,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${fakeAudio}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    viewport: { width: 1649, height: 928 },
    screenshot: 'only-on-failure',
    video: 'on',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: './tests/reports/playwright-html', open: 'never' }],
    ['json', { outputFile: './tests/reports/results.json' }],
  ],
});
