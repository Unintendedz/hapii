import { readdir, readFile, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface SlashCommand {
    name: string;
    description?: string;
    source: 'builtin' | 'user' | 'plugin';
    content?: string;  // Expanded content for Codex user prompts
    pluginName?: string;  // Name of the plugin that provides this command
}

export interface ListSlashCommandsRequest {
    agent: string;
    workingDirectory?: string;
}

export interface ListSlashCommandsResponse {
    success: boolean;
    commands?: SlashCommand[];
    error?: string;
}

/**
 * Built-in slash commands for each agent type.
 */
const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        { name: 'clear', description: 'Clear conversation history', source: 'builtin' },
        { name: 'compact', description: 'Compact conversation context', source: 'builtin' },
        { name: 'context', description: 'Show context information', source: 'builtin' },
        { name: 'cost', description: 'Show session cost', source: 'builtin' },
        { name: 'plan', description: 'Toggle plan mode', source: 'builtin' },
    ],
    codex: [],
    gemini: [
        { name: 'about', description: 'About Gemini', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation', source: 'builtin' },
        { name: 'compress', description: 'Compress context', source: 'builtin' },
    ],
    opencode: [],
};

/**
 * Interface for installed_plugins.json structure
 */
interface InstalledPluginsFile {
    version: number;
    plugins: Record<string, Array<{
        scope: string;
        installPath: string;
        version: string;
        installedAt: string;
        lastUpdated: string;
        gitCommitSha?: string;
    }>>;
}

/**
 * Parse frontmatter from a markdown file content.
 * Returns the name/description (from frontmatter) and the body content.
 */
function parseFrontmatter(fileContent: string): { name?: string; description?: string; content: string } {
    // Match frontmatter: starts with ---, ends with ---
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
        const yamlContent = match[1];
        const body = match[2].trim();
        try {
            const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
            const name = typeof parsed?.name === 'string' ? parsed.name.trim() : undefined;
            const description = typeof parsed?.description === 'string' ? parsed.description : undefined;
            return { name: name && name.length > 0 ? name : undefined, description, content: body };
        } catch {
            // Invalid YAML - the --- block is not valid frontmatter, return entire file
            return { content: fileContent.trim() };
        }
    }
    // No frontmatter, entire file is content
    return { content: fileContent.trim() };
}

/**
 * Get the user commands directory for an agent type.
 * Returns null if the agent doesn't support user commands.
 */
function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
            return join(configDir, 'commands');
        }
        case 'codex': {
            const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
            return join(codexHome, 'prompts');
        }
        default:
            // Gemini and other agents don't have user commands
            return null;
    }
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory()
    } catch {
        return false
    }
}

/**
 * Find the nearest project command directory by walking up from the working directory.
 * Mirrors how most tools treat project-local config as inheritable from parent dirs.
 */
async function findProjectCommandsDir(agent: string, workingDirectory: string): Promise<string | null> {
    const start = resolve(workingDirectory)
    let current = start

    while (true) {
        const candidate = agent === 'claude'
            ? join(current, '.claude', 'commands')
            : agent === 'codex'
                ? join(current, '.codex', 'prompts')
                : null

        if (candidate && await isDirectory(candidate)) {
            return candidate
        }

        const parent = dirname(current)
        if (parent === current) {
            return null
        }
        current = parent
    }
}

/**
 * Scan a directory for commands (*.md files).
 * Returns commands with parsed frontmatter.
 */
async function scanCommandsDir(
    dir: string,
    source: 'user' | 'plugin',
    pluginName?: string
): Promise<SlashCommand[]> {
    try {
        const collectMarkdownFiles = async (currentDir: string, relDir: string): Promise<Array<{
            dir: string
            fileName: string
            relDir: string
        }>> => {
            const entries = await readdir(currentDir, { withFileTypes: true })
            const result: Array<{ dir: string; fileName: string; relDir: string }> = []

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const nextRelDir = relDir ? join(relDir, entry.name) : entry.name
                    const nested = await collectMarkdownFiles(join(currentDir, entry.name), nextRelDir)
                    result.push(...nested)
                    continue
                }

                if (entry.isFile() && entry.name.endsWith('.md')) {
                    result.push({ dir: currentDir, fileName: entry.name, relDir })
                }
            }

            return result
        }

        const mdFiles = await collectMarkdownFiles(dir, '')

        // Read all files in parallel
        const commands = await Promise.all(
            mdFiles.map(async (entry): Promise<SlashCommand | null> => {
                const baseName = entry.fileName.slice(0, -3);
                if (!baseName) return null;

                try {
                    const filePath = join(entry.dir, entry.fileName);
                    const fileContent = await readFile(filePath, 'utf-8');
                    const parsed = parseFrontmatter(fileContent);
                    const resolvedName = parsed.name ?? baseName;
                    if (!resolvedName) return null;

                    // For plugin commands, prefix with plugin name (e.g., "superpowers:brainstorm")
                    const name = pluginName ? `${pluginName}:${resolvedName}` : resolvedName;
                    const locationHint = entry.relDir ? ` (${entry.relDir})` : '';
                    const baseDescription = parsed.description
                        ?? (source === 'plugin' ? `${pluginName} command` : 'Custom command')

                    return {
                        name,
                        description: `${baseDescription}${locationHint}`,
                        source,
                        content: parsed.content,
                        pluginName,
                    };
                } catch {
                    const locationHint = entry.relDir ? ` (${entry.relDir})` : '';
                    const name = pluginName ? `${pluginName}:${baseName}` : baseName;
                    // Failed to read file, return basic command
                    return {
                        name,
                        description: `${source === 'plugin' ? `${pluginName} command` : 'Custom command'}${locationHint}`,
                        source,
                        pluginName,
                    };
                }
            })
        );

        // Filter nulls and sort alphabetically
        return commands
            .filter((cmd): cmd is SlashCommand => cmd !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // Directory doesn't exist or not accessible - return empty array
        return [];
    }
}

/**
 * Scan user-defined commands from ~/.claude/commands/ or equivalent
 */
async function scanUserCommands(agent: string): Promise<SlashCommand[]> {
    const dir = getUserCommandsDir(agent);
    if (!dir) {
        return [];
    }
    return scanCommandsDir(dir, 'user');
}

/**
 * Scan project-local commands from .claude/commands (Claude) or .codex/prompts (Codex).
 */
async function scanProjectCommands(agent: string, workingDirectory: string): Promise<SlashCommand[]> {
    if (!workingDirectory || workingDirectory.trim().length === 0) {
        return []
    }

    const dir = await findProjectCommandsDir(agent, workingDirectory)
    if (!dir) {
        return []
    }

    // Treat project-local commands as "user" for now so the web UI behaves the same.
    // (The UI currently expands Codex "user" prompts, and does not distinguish scope.)
    return scanCommandsDir(dir, 'user')
}

/**
 * Scan plugin commands from installed Claude plugins.
 * Reads ~/.claude/plugins/installed_plugins.json to find installed plugins,
 * then scans each plugin's commands directory.
 */
async function scanPluginCommands(agent: string): Promise<SlashCommand[]> {
    // Only Claude supports plugins for now
    if (agent !== 'claude') {
        return [];
    }

    const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
    const installedPluginsPath = join(configDir, 'plugins', 'installed_plugins.json');

    try {
        const content = await readFile(installedPluginsPath, 'utf-8');
        const installedPlugins = JSON.parse(content) as InstalledPluginsFile;

        if (!installedPlugins.plugins) {
            return [];
        }

        const allCommands: SlashCommand[] = [];

        // Process each installed plugin
        for (const [pluginKey, installations] of Object.entries(installedPlugins.plugins)) {
            // Plugin key format: "pluginName@marketplace" or "@scope/pluginName@marketplace"
            // Use the last '@' as the separator between plugin name and marketplace
            const lastAtIndex = pluginKey.lastIndexOf('@');
            const pluginName = lastAtIndex > 0 ? pluginKey.substring(0, lastAtIndex) : pluginKey;

            if (installations.length === 0) continue;

            // Sort installations by lastUpdated descending to get the newest one
            const sortedInstallations = [...installations].sort((a, b) => {
                return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
            });

            const installation = sortedInstallations[0];
            if (!installation?.installPath) continue;

            const commandsDir = join(installation.installPath, 'commands');
            const commands = await scanCommandsDir(commandsDir, 'plugin', pluginName);
            allCommands.push(...commands);
        }

        return allCommands.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // installed_plugins.json doesn't exist or is invalid
        return [];
    }
}

/**
 * List all available slash commands for an agent type.
 * Returns built-in commands, user-defined commands, and plugin commands.
 */
export async function listSlashCommands(agent: string, workingDirectory?: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? [];

    // Scan user commands, project commands, and plugin commands in parallel
    const [user, project, plugin] = await Promise.all([
        scanUserCommands(agent),
        scanProjectCommands(agent, workingDirectory ?? ''),
        scanPluginCommands(agent),
    ]);

    // Combine: built-in first, then project commands, then user commands, then plugin commands.
    // Dedupe by name with first-write-wins (preserves precedence order).
    const combined = [...builtin, ...project, ...user, ...plugin]
    const byName = new Map<string, SlashCommand>()
    for (const cmd of combined) {
        if (!byName.has(cmd.name)) {
            byName.set(cmd.name, cmd)
        }
    }
    return Array.from(byName.values())
}
