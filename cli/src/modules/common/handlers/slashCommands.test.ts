import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerSlashCommandHandlers } from './slashCommands'

async function createTempDir(prefix: string): Promise<string> {
    const base = tmpdir()
    const path = join(base, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

describe('slash commands RPC handler', () => {
    let rootDir: string
    let configDir: string
    let codexHomeDir: string
    let previousClaudeConfigDir: string | undefined
    let previousCodexHomeDir: string | undefined
    let rpc: RpcHandlerManager

    beforeEach(async () => {
        if (rootDir) {
            await rm(rootDir, { recursive: true, force: true })
        }
        if (configDir) {
            await rm(configDir, { recursive: true, force: true })
        }

        rootDir = await createTempDir('hapi-slash-commands-project')
        configDir = await createTempDir('hapi-slash-commands-user')
        codexHomeDir = await createTempDir('hapi-slash-commands-codex')

        previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
        process.env.CLAUDE_CONFIG_DIR = configDir
        previousCodexHomeDir = process.env.CODEX_HOME
        process.env.CODEX_HOME = codexHomeDir

        // Project-local commands: <repo>/.claude/commands/*.md
        await mkdir(join(rootDir, '.claude', 'commands'), { recursive: true })
        await writeFile(
            join(rootDir, '.claude', 'commands', 'project-cmd.md'),
            [
                '---',
                "description: 'Project command'",
                '---',
                '',
                '# project',
                '',
                'body',
                ''
            ].join('\n')
        )

        // Frontmatter "name" overrides file name
        await writeFile(
            join(rootDir, '.claude', 'commands', 'weird-file-name.md'),
            [
                '---',
                "name: 'frontmatter-name'",
                "description: 'Named command'",
                '---',
                '',
                '# named',
                ''
            ].join('\n')
        )

        // Project-local commands (Codex): <repo>/.codex/prompts/*.md
        await mkdir(join(rootDir, '.codex', 'prompts'), { recursive: true })
        await writeFile(
            join(rootDir, '.codex', 'prompts', 'project-codex.md'),
            [
                '---',
                "name: 'codex-project'",
                "description: 'Codex project command'",
                '---',
                '',
                '# codex project',
                ''
            ].join('\n')
        )

        // Project-local nested commands are supported
        await mkdir(join(rootDir, '.claude', 'commands', 'nested'), { recursive: true })
        await writeFile(
            join(rootDir, '.claude', 'commands', 'nested', 'nested-cmd.md'),
            [
                '---',
                "description: 'Nested command'",
                '---',
                '',
                '# nested',
                ''
            ].join('\n')
        )

        // User/global commands: ~/.claude/commands/*.md (config dir is overridden in test)
        await mkdir(join(configDir, 'commands'), { recursive: true })
        await writeFile(
            join(configDir, 'commands', 'user-cmd.md'),
            [
                '---',
                "description: 'User command'",
                '---',
                '',
                '# user',
                ''
            ].join('\n')
        )

        // Codex user/global prompts: ~/.codex/prompts/*.md (CODEX_HOME is overridden in test)
        await mkdir(join(codexHomeDir, 'prompts'), { recursive: true })
        await writeFile(
            join(codexHomeDir, 'prompts', 'user-codex.md'),
            [
                '---',
                "name: 'codex-user'",
                "description: 'Codex user command'",
                '---',
                '',
                '# codex user',
                ''
            ].join('\n')
        )

        rpc = new RpcHandlerManager({ scopePrefix: 'session-test' })
        registerSlashCommandHandlers(rpc, rootDir)
    })

    afterEach(async () => {
        if (previousClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR
        } else {
            process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
        }
        if (previousCodexHomeDir === undefined) {
            delete process.env.CODEX_HOME
        } else {
            process.env.CODEX_HOME = previousCodexHomeDir
        }

        if (rootDir) {
            await rm(rootDir, { recursive: true, force: true })
        }
        if (configDir) {
            await rm(configDir, { recursive: true, force: true })
        }
        if (codexHomeDir) {
            await rm(codexHomeDir, { recursive: true, force: true })
        }
    })

    it('includes project + user commands for Claude', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:listSlashCommands',
            params: JSON.stringify({ agent: 'claude' })
        })

        const parsed = JSON.parse(response) as { success: boolean; commands?: Array<{ name: string; description?: string; source: string }> }
        expect(parsed.success).toBe(true)

        const names = (parsed.commands ?? []).map((cmd) => cmd.name)
        expect(names).toContain('project-cmd')
        expect(names).toContain('frontmatter-name')
        expect(names).not.toContain('weird-file-name')
        expect(names).toContain('nested-cmd')
        expect(names).toContain('user-cmd')

        const nested = (parsed.commands ?? []).find((cmd) => cmd.name === 'nested-cmd')
        expect(nested?.description).toContain('Nested command')
        expect(nested?.description).toContain('nested')
    })

    it('includes project + user commands for Codex (using workingDirectory override)', async () => {
        const workDir = join(rootDir, 'subdir')
        await mkdir(workDir, { recursive: true })

        const response = await rpc.handleRequest({
            method: 'session-test:listSlashCommands',
            params: JSON.stringify({ agent: 'codex', workingDirectory: workDir })
        })

        const parsed = JSON.parse(response) as { success: boolean; commands?: Array<{ name: string; description?: string; source: string }> }
        expect(parsed.success).toBe(true)

        const names = (parsed.commands ?? []).map((cmd) => cmd.name)
        expect(names).toContain('codex-project')
        expect(names).toContain('codex-user')
    })
})
