import { expect, test, type Page } from '@playwright/test'

async function getRelativeTop(page: Page, anchorId: string): Promise<number> {
    return page.evaluate(({ anchorId }) => {
        const viewport = document.querySelector<HTMLElement>('[data-testid="viewport"]')
        if (!viewport) throw new Error('missing viewport')

        const anchor = viewport.querySelector<HTMLElement>(`[data-hapi-message-id="${anchorId}"]`)
        if (!anchor) throw new Error(`missing anchor ${anchorId}`)

        const vr = viewport.getBoundingClientRect()
        const ar = anchor.getBoundingClientRect()
        return ar.top - vr.top
    }, { anchorId })
}

async function getScrollTop(page: Page): Promise<number> {
    return page.evaluate(() => {
        const viewport = document.querySelector<HTMLElement>('[data-testid="viewport"]')
        if (!viewport) throw new Error('missing viewport')
        return viewport.scrollTop
    })
}

test('keeps scroll anchored when prepending history (with late layout changes)', async ({ page }) => {
    await page.goto('/__e2e__/scroll-prepend')

    const status = page.getByTestId('status')
    await expect(status).toHaveAttribute('data-phase', 'idle')

    const loadOlder = page.getByTestId('load-older')
    const viewport = page.getByTestId('viewport')

    for (let i = 0; i < 3; i += 1) {
        // Go to top as user would before triggering "load older".
        await viewport.evaluate((el) => {
            el.scrollTop = 0
        })

        const anchorId = await page.evaluate(() => {
            const viewportEl = document.querySelector<HTMLElement>('[data-testid="viewport"]')
            if (!viewportEl) throw new Error('missing viewport')
            const first = viewportEl.querySelector<HTMLElement>('[data-hapi-message-id]')
            const id = first?.dataset.hapiMessageId
            if (!id) throw new Error('missing first message id')
            return id
        })

        const before = await getRelativeTop(page, anchorId)

        await loadOlder.click()
        await expect(status).toHaveAttribute('data-phase', 'settled')

        const after = await getRelativeTop(page, anchorId)
        expect(Math.abs(after - before)).toBeLessThan(1.5)

        const scrollTop = await getScrollTop(page)
        expect(scrollTop).toBeGreaterThan(0)
    }
})
