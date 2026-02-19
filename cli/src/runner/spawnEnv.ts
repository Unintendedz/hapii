function getPathDelimiter(): ';' | ':' {
    return process.platform === 'win32' ? ';' : ':';
}

function splitPathEntries(value: string, delimiter: ';' | ':'): string[] {
    return value
        .split(delimiter)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function dedupePreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        unique.push(value);
    }

    return unique;
}

export function buildRunnerSpawnEnv(
    baseEnv: NodeJS.ProcessEnv,
    overrides: Record<string, string>
): {
    env: Record<string, string>;
    prependedPathEntries: string[];
} {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
        if (typeof value === 'string') {
            env[key] = value;
        }
    }

    for (const [key, value] of Object.entries(overrides)) {
        env[key] = value;
    }

    const rawExtraPath = baseEnv.HAPI_RUNNER_EXTRA_PATH;
    if (rawExtraPath === undefined) {
        return { env, prependedPathEntries: [] };
    }

    const trimmedExtraPath = rawExtraPath.trim();
    if (!trimmedExtraPath) {
        throw new Error('HAPI_RUNNER_EXTRA_PATH is set but empty');
    }

    const delimiter = getPathDelimiter();
    const prependedPathEntries = splitPathEntries(trimmedExtraPath, delimiter);
    if (prependedPathEntries.length === 0) {
        throw new Error('HAPI_RUNNER_EXTRA_PATH does not contain valid PATH entries');
    }

    const existingPathEntries = typeof env.PATH === 'string'
        ? splitPathEntries(env.PATH, delimiter)
        : [];
    const merged = dedupePreserveOrder([
        ...prependedPathEntries,
        ...existingPathEntries
    ]);

    env.PATH = merged.join(delimiter);

    return { env, prependedPathEntries };
}
