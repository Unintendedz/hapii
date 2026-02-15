import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: 'web/e2e',
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    webServer: {
        command: 'bun run --cwd web dev -- --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
    },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
            },
        },
    ],
})
