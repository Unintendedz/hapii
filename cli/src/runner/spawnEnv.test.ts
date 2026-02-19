import { describe, expect, it } from 'vitest';
import { buildRunnerSpawnEnv } from './spawnEnv';

describe('buildRunnerSpawnEnv', () => {
    it('merges base env and overrides', () => {
        const result = buildRunnerSpawnEnv(
            {
                PATH: '/usr/bin:/bin',
                FOO: 'from-base'
            },
            {
                BAR: 'from-override',
                FOO: 'override-wins'
            }
        );

        expect(result.env.FOO).toBe('override-wins');
        expect(result.env.BAR).toBe('from-override');
        expect(result.env.PATH).toBe('/usr/bin:/bin');
        expect(result.prependedPathEntries).toEqual([]);
    });

    it('prepends HAPI_RUNNER_EXTRA_PATH entries and de-duplicates', () => {
        const result = buildRunnerSpawnEnv(
            {
                PATH: '/usr/bin:/opt/homebrew/bin',
                HAPI_RUNNER_EXTRA_PATH: '/opt/homebrew/bin:/usr/local/bin'
            },
            {}
        );

        expect(result.prependedPathEntries).toEqual([
            '/opt/homebrew/bin',
            '/usr/local/bin'
        ]);
        expect(result.env.PATH).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin');
    });

    it('throws when HAPI_RUNNER_EXTRA_PATH is set but empty', () => {
        expect(() => {
            buildRunnerSpawnEnv(
                {
                    PATH: '/usr/bin:/bin',
                    HAPI_RUNNER_EXTRA_PATH: '   '
                },
                {}
            );
        }).toThrow('HAPI_RUNNER_EXTRA_PATH is set but empty');
    });
});
