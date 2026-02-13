import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile, open, unlink, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface Settings {
    machineId?: string
    machineIdConfirmedByServer?: boolean
    runnerAutoStartWhenRunningHappy?: boolean
    cliApiToken?: string
    includeCoAuthoredBy?: boolean
    vapidKeys?: {
        publicKey: string
        privateKey: string
    }
    // Server configuration (persisted from environment variables)
    telegramBotToken?: string
    telegramNotification?: boolean
    listenHost?: string
    listenPort?: number
    publicUrl?: string
    corsOrigins?: string[]
    // Legacy field names (for migration, read-only)
    webappHost?: string
    webappPort?: number
    webappUrl?: string
}

export function getSettingsFile(dataDir: string): string {
    return join(dataDir, 'settings.json')
}

/**
 * Read settings from file, preserving all existing fields.
 * Returns null if file exists but cannot be parsed (to avoid data loss).
 */
export async function readSettings(settingsFile: string): Promise<Settings | null> {
    if (!existsSync(settingsFile)) {
        return {}
    }
    try {
        const content = await readFile(settingsFile, 'utf8')
        return JSON.parse(content)
    } catch (error) {
        // Return null to signal parse error - caller should not overwrite
        console.error(`[WARN] Failed to parse ${settingsFile}: ${error}`)
        return null
    }
}

export async function readSettingsOrThrow(settingsFile: string): Promise<Settings> {
    const settings = await readSettings(settingsFile)
    if (settings === null) {
        throw new Error(
            `Cannot read ${settingsFile}. Please fix or remove the file and restart.`
        )
    }
    return settings
}

/**
 * Write settings to file atomically (temp file + rename)
 */
export async function writeSettings(settingsFile: string, settings: Settings): Promise<void> {
    const dir = dirname(settingsFile)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 })
    }

    const tmpFile = settingsFile + '.tmp'
    await writeFile(tmpFile, JSON.stringify(settings, null, 2))
    await rename(tmpFile, settingsFile)
}

/**
 * Atomically update settings with multi-process safety via file locking.
 * Compatible with the CLI lock mechanism (settings.json.lock).
 */
export async function updateSettings(
    settingsFile: string,
    updater: (current: Settings) => Settings | Promise<Settings>
): Promise<Settings> {
    const LOCK_RETRY_INTERVAL_MS = 100
    const MAX_LOCK_ATTEMPTS = 50 // 5 seconds
    const STALE_LOCK_TIMEOUT_MS = 10_000

    const dir = dirname(settingsFile)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 })
    }

    const lockFile = settingsFile + '.lock'
    const tmpFile = settingsFile + '.tmp'

    let fileHandle: Awaited<ReturnType<typeof open>> | null = null
    let attempts = 0

    while (attempts < MAX_LOCK_ATTEMPTS) {
        try {
            fileHandle = await open(lockFile, 'wx')
            break
        } catch (error: any) {
            if (error?.code !== 'EEXIST') {
                throw error
            }

            attempts++
            await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS))

            try {
                const stats = await stat(lockFile)
                if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
                    await unlink(lockFile).catch(() => { })
                }
            } catch {
                // Ignore - lock file may disappear between checks
            }
        }
    }

    if (!fileHandle) {
        throw new Error(`Failed to acquire settings lock after ${MAX_LOCK_ATTEMPTS * LOCK_RETRY_INTERVAL_MS / 1000} seconds`)
    }

    try {
        const current = await readSettingsOrThrow(settingsFile)
        const updated = await updater(current)
        await writeFile(tmpFile, JSON.stringify(updated, null, 2))
        await rename(tmpFile, settingsFile)
        return updated
    } finally {
        await fileHandle.close()
        await unlink(lockFile).catch(() => { })
    }
}
