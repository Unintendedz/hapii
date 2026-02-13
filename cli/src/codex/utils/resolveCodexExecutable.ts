import { accessSync, constants, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import { basename, dirname, join } from 'node:path'

export type ResolvedCodexExecutable = {
    command: string
    binDir: string
}

function isExecutable(path: string): boolean {
    try {
        accessSync(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

function resolveFromPath(pathValue: string | undefined): ResolvedCodexExecutable | null {
    if (!pathValue) return null

    const delimiter = process.platform === 'win32' ? ';' : ':'
    const parts = pathValue.split(delimiter).filter(Boolean)

    for (const part of parts) {
        const candidate = join(part, 'codex')
        if (existsSync(candidate) && isExecutable(candidate)) {
            return { command: candidate, binDir: part }
        }
    }

    return null
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
}): ResolvedCodexExecutable | null {
    const nvmDir = options.env.NVM_DIR?.trim() || join(options.homeDir, '.nvm')
    if (!nvmDir) return null

    const nvmBin = options.env.NVM_BIN?.trim()
    if (nvmBin) {
        const candidate = join(nvmBin, 'codex')
        if (existsSync(candidate) && isExecutable(candidate)) {
            return { command: candidate, binDir: nvmBin }
        }
    }

    const versionsDir = join(nvmDir, 'versions', 'node')
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
        const binDir = join(versionsDir, entry.name, 'bin')
        const candidate = join(binDir, 'codex')
        if (existsSync(candidate) && isExecutable(candidate)) {
            return { command: candidate, binDir }
        }
    }

    return null
}

function resolveFromCommonUserBins(homeDir: string): ResolvedCodexExecutable | null {
    const candidates = [
        join(homeDir, '.volta', 'bin', 'codex'),
        join(homeDir, '.asdf', 'shims', 'codex'),
        join(homeDir, '.bun', 'bin', 'codex'),
        join(homeDir, '.local', 'bin', 'codex'),
        join(homeDir, '.npm-global', 'bin', 'codex'),
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex'
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate) && isExecutable(candidate)) {
            return { command: candidate, binDir: dirname(candidate) }
        }
    }

    return null
}

export function resolveCodexExecutable(options?: {
    env?: NodeJS.ProcessEnv
    homeDir?: string
}): ResolvedCodexExecutable | null {
    const env = options?.env ?? process.env
    const homeDir = options?.homeDir ?? os.homedir()

    const explicit = env.HAPI_CODEX_BIN?.trim()
        || env.CODEX_BIN?.trim()
        || env.CODEX_PATH?.trim()
    if (explicit && existsSync(explicit) && isExecutable(explicit)) {
        return { command: explicit, binDir: dirname(explicit) }
    }

    const fromPath = resolveFromPath(env.PATH)
    if (fromPath) return fromPath

    const fromNvm = resolveFromNvm({ env, homeDir })
    if (fromNvm) return fromNvm

    const fromCommon = resolveFromCommonUserBins(homeDir)
    if (fromCommon) return fromCommon

    return null
}

export function buildEnvWithPrependedPath(env: NodeJS.ProcessEnv, binDir: string): Record<string, string> {
    const resolvedBinDir = binDir.trim()
    if (!resolvedBinDir) {
        throw new Error('Invalid binDir for PATH')
    }

    const nextEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
            nextEnv[key] = value
        }
    }

    const delimiter = process.platform === 'win32' ? ';' : ':'
    const current = nextEnv.PATH
    const parts = (current ? current.split(delimiter) : []).filter(Boolean)

    if (!parts.includes(resolvedBinDir)) {
        parts.unshift(resolvedBinDir)
    }

    nextEnv.PATH = parts.join(delimiter)
    return nextEnv
}

export function describeCodexCommand(command: string): string {
    const name = basename(command)
    if (name === 'codex') {
        return command
    }
    return `codex (${command})`
}

