import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 2,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8080/Jweather/',
        browserName: 'chromium',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node tests/server.mjs',
        url: 'http://127.0.0.1:8080/Jweather/',
        reuseExistingServer: !process.env.CI,
        timeout: 10000
    }
});
