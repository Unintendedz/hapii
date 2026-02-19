import { expect, test } from '@playwright/test'

test('clicking update banner performs a hard reload', async ({ page }) => {
    await page.goto('/__e2e__/update-banner')

    await expect(page.getByTestId('load-count')).toHaveText('1')

    await page.getByTestId('trigger-update').click()
    await expect(page.getByTestId('update-banner-button')).toBeVisible()

    await page.getByTestId('update-banner-button').click()

    await expect(page.getByTestId('load-count')).toHaveText('2')
})
