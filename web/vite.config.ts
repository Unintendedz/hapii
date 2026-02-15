import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const base = process.env.VITE_BASE_URL || '/'
const repoRoot = resolve(__dirname, '..')

function pad2(value: number): string {
    return String(value).padStart(2, '0')
}

function formatBuildTimestampUTC8(date: Date = new Date()): string {
    // Always show a human-readable timestamp in UTC+8 (Asia/Shanghai),
    // independent of the builder machine's local timezone.
    const utc8Ms = date.getTime() + 8 * 60 * 60 * 1000
    const d = new Date(utc8Ms)

    const yyyy = d.getUTCFullYear()
    const mm = pad2(d.getUTCMonth() + 1)
    const dd = pad2(d.getUTCDate())
    const hh = pad2(d.getUTCHours())
    const mi = pad2(d.getUTCMinutes())
    const ss = pad2(d.getUTCSeconds())

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} +08:00`
}

function resolveBuildId(): string {
    const fromEnv = process.env.HAPI_BUILD_ID?.trim()
    const timestamp = formatBuildTimestampUTC8()

    try {
        const sha = execSync(`git -C "${repoRoot}" rev-parse --short HEAD`, { encoding: 'utf8' }).trim()
        if (!sha) {
            throw new Error('empty git sha')
        }
        return `${timestamp} ${fromEnv || sha}`
    } catch (error) {
        if (fromEnv) {
            return `${timestamp} ${fromEnv}`
        }
        throw new Error(
            `Failed to resolve build id (set HAPI_BUILD_ID to override). Original error: ${String(error)}`
        )
    }
}

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(require('../cli/package.json').version),
        __APP_BUILD__: JSON.stringify(resolveBuildId()),
    },
    server: {
        host: true,
        allowedHosts: ['hapidev.weishu.me'],
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3006',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://127.0.0.1:3006',
                ws: true
            }
        }
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'mask-icon.svg'],
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            manifest: {
                name: 'HAPI',
                short_name: 'HAPI',
                description: 'AI-powered development assistant',
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: base,
                start_url: base,
                icons: [
                    {
                        src: 'pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
            },
            devOptions: {
                enabled: true,
                type: 'module'
            }
        })
    ],
    base,
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
})
