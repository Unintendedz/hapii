import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { readSettingsOrThrow, updateSettings } from '../../config/settings'
import type { WebAppEnv } from '../middleware/auth'

const updateAppSettingsSchema = z.object({
    includeCoAuthoredBy: z.boolean()
})

function resolveIncludeCoAuthoredBy(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true
}

export function createSettingsRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/settings', async (c) => {
        const settings = await readSettingsOrThrow(configuration.settingsFile)
        return c.json({
            includeCoAuthoredBy: resolveIncludeCoAuthoredBy(settings.includeCoAuthoredBy)
        })
    })

    app.post('/settings', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = updateAppSettingsSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const updated = await updateSettings(configuration.settingsFile, (current) => ({
            ...current,
            includeCoAuthoredBy: parsed.data.includeCoAuthoredBy
        }))

        return c.json({
            includeCoAuthoredBy: resolveIncludeCoAuthoredBy(updated.includeCoAuthoredBy)
        })
    })

    return app
}

