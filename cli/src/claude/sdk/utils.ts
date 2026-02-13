/**
 * Utility functions for Claude Code SDK integration
 * Provides helper functions for path resolution and logging
 */

import { accessSync, constants, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { logger } from '@/ui/logger'

/**
 * Find Claude executable path on Windows.
 * Returns absolute path to claude.exe for use with shell: false
 */
function findWindowsClaudePath(): string | null {
    const homeDir = homedir()
    const path = require('node:path')

    // Known installation paths for Claude on Windows
    const candidates = [
        path.join(homeDir, '.local', 'bin', 'claude.exe'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
        path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Anthropic.claude-code_Microsoft.Winget.Source_8wekyb3d8bbwe', 'claude.exe'),
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            logger.debug(`[Claude SDK] Found Windows claude.exe at: ${candidate}`)
            return candidate
        }
    }

    // Try 'where claude' to find in PATH
    try {
        const result = execSync('where claude.exe', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        }).trim().split('\n')[0].trim()
        if (result && existsSync(result)) {
            logger.debug(`[Claude SDK] Found Windows claude.exe via where: ${result}`)
            return result
        }
    } catch {
        // where didn't find it
    }

    return null
}

/**
 * Try to find globally installed Claude CLI
 * On Windows: Returns absolute path to claude.exe (for shell: false)
 * On Unix: Returns 'claude' if command works, or actual path via which
 * Runs from home directory to avoid local cwd side effects
 */
function findGlobalClaudePath(): string | null {
    const homeDir = homedir()

    // Windows: Always return absolute path for shell: false compatibility
    if (process.platform === 'win32') {
        return findWindowsClaudePath()
    }

    // Unix: Check if 'claude' command works directly from home dir
    try {
        execSync('claude --version', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        })
        logger.debug('[Claude SDK] Global claude command available')
        return 'claude'
    } catch {
        // claude command not available globally
    }

    // FALLBACK for Unix: try which to get actual path
    try {
        const result = execSync('which claude', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        }).trim()
        if (result && existsSync(result) && isExecutable(result)) {
            logger.debug(`[Claude SDK] Found global claude path via which: ${result}`)
            return result
        }
    } catch {
        // which didn't find it
    }

    // Fallback: try common NVM locations (npm install -g often lands here)
    const fromNvm = resolveFromNvm({ env: process.env, homeDir })
    if (fromNvm) {
        logger.debug(`[Claude SDK] Found global claude path via nvm: ${fromNvm}`)
        return fromNvm
    }

    // Fallback: typical install locations (launchd/systemd PATH can be minimal)
    const fromCommon = resolveFromCommonUserBins(homeDir)
    if (fromCommon) {
        logger.debug(`[Claude SDK] Found global claude path via common bins: ${fromCommon}`)
        return fromCommon
    }

    return null
}

function isExecutable(path: string): boolean {
    try {
        accessSync(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

type VersionTuple = [number, number, number]

function parseVersion(name: string): VersionTuple | null {
    const trimmed = name.startsWith('v') ? name.slice(1) : name
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed)
    if (!match) return null
    return [
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10),
        Number.parseInt(match[3], 10)
    ]
}

function compareVersions(a: VersionTuple, b: VersionTuple): number {
    for (let i = 0; i < 3; i += 1) {
        const diff = a[i] - b[i]
        if (diff !== 0) return diff
    }
    return 0
}

function resolveFromNvm(options: {
    env: NodeJS.ProcessEnv
    homeDir: string
}): string | null {
    const path = require('node:path')

    const nvmDir = options.env.NVM_DIR?.trim() || path.join(options.homeDir, '.nvm')
    if (!nvmDir) return null

    const nvmBin = options.env.NVM_BIN?.trim()
    if (nvmBin) {
        const candidate = path.join(nvmBin, 'claude')
        if (existsSync(candidate) && isExecutable(candidate)) {
            return candidate
        }
    }

    const versionsDir = path.join(nvmDir, 'versions', 'node')
    if (!existsSync(versionsDir)) return null

    let entries: { name: string; version: VersionTuple }[] = []
    try {
        entries = readdirSync(versionsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => {
                const version = parseVersion(entry.name)
                return version ? { name: entry.name, version } : null
            })
            .filter((entry): entry is { name: string; version: VersionTuple } => Boolean(entry))
    } catch {
        return null
    }

    entries.sort((a, b) => compareVersions(b.version, a.version))

    for (const entry of entries) {
        const binDir = path.join(versionsDir, entry.name, 'bin')
        const candidate = path.join(binDir, 'claude')
        if (existsSync(candidate) && isExecutable(candidate)) {
            return candidate
        }
    }

    return null
}

function resolveFromCommonUserBins(homeDir: string): string | null {
    const path = require('node:path')
    const candidates = [
        path.join(homeDir, '.volta', 'bin', 'claude'),
        path.join(homeDir, '.asdf', 'shims', 'claude'),
        path.join(homeDir, '.bun', 'bin', 'claude'),
        path.join(homeDir, '.local', 'bin', 'claude'),
        path.join(homeDir, 'Library', 'pnpm', 'claude'),
        path.join(homeDir, '.local', 'share', 'pnpm', 'claude'),
        path.join(homeDir, '.npm-global', 'bin', 'claude'),
        path.join(homeDir, '.yarn', 'bin', 'claude'),
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude'
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate) && isExecutable(candidate)) {
            return candidate
        }
    }

    return null
}

/**
 * Get default path to Claude Code executable.
 *
 * Environment variables:
 * - HAPI_CLAUDE_PATH: Force a specific path to claude executable
 */
export function getDefaultClaudeCodePath(): string {
    // Allow explicit override via env var
    if (process.env.HAPI_CLAUDE_PATH) {
        logger.debug(`[Claude SDK] Using HAPI_CLAUDE_PATH: ${process.env.HAPI_CLAUDE_PATH}`)
        return process.env.HAPI_CLAUDE_PATH
    }

    // Find global claude
    const globalPath = findGlobalClaudePath()
    if (globalPath) {
        return globalPath
    }

    const searchedHome = homedir()
    const pathPreview = typeof process.env.PATH === 'string' ? process.env.PATH : ''
    throw new Error(
        [
            'Claude Code CLI not found.',
            'This often happens for runner-spawned sessions when PATH is minimal (e.g. launchd/systemd).',
            `Tried PATH (len=${pathPreview.length}) and common bins under ${searchedHome}.`,
            'Fix: ensure claude is on PATH for the runner, or set HAPI_CLAUDE_PATH to the claude executable path.'
        ].join(' ')
    )
}

/**
 * Log debug message
 */
export function logDebug(message: string): void {
    if (process.env.DEBUG) {
        logger.debug(message)
        console.log(message)
    }
}

/**
 * Stream async messages to stdin
 */
export async function streamToStdin(
    stream: AsyncIterable<unknown>,
    stdin: NodeJS.WritableStream,
    abort?: AbortSignal
): Promise<void> {
    for await (const message of stream) {
        if (abort?.aborted) break
        stdin.write(JSON.stringify(message) + '\n')
    }
    stdin.end()
}
