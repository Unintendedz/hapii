export type LongMessageHeading = {
    id: string
    label: string
    level: 2 | 3 | 4
}

export type LongMessageHeadingPosition = {
    id: string
    top: number
}

const HEADING_SELECTOR = 'h2, h3, h4'
export const LONG_MESSAGE_NAVIGATION_CONTENT_ATTR = 'data-hapi-long-message-content'
export const LONG_MESSAGE_NAVIGATION_EXCLUDE_ATTR = 'data-hapi-long-message-exclude'
const LONG_MESSAGE_NAVIGATION_CONTENT_SELECTOR = `[${LONG_MESSAGE_NAVIGATION_CONTENT_ATTR}="true"]`
const LONG_MESSAGE_NAVIGATION_EXCLUDE_SELECTOR = `[${LONG_MESSAGE_NAVIGATION_EXCLUDE_ATTR}="true"]`

export function normalizeLongMessageHeadingSegment(text: string): string {
    const normalized = text
        .trim()
        .toLocaleLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '')

    return normalized || 'section'
}

export function shouldShowLongMessageJumpControls(messageHeight: number, viewportHeight: number): boolean {
    if (!Number.isFinite(messageHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
        return false
    }

    return messageHeight > viewportHeight + 80
}

export function getActiveLongMessageHeadingId(
    headings: LongMessageHeadingPosition[],
    activationTop: number
): string | null {
    let activeId: string | null = null

    for (const heading of headings) {
        if (heading.top > activationTop) {
            break
        }
        activeId = heading.id
    }

    return activeId
}

export function findLongMessageStartElement(container: ParentNode): HTMLElement | null {
    for (const element of Array.from(container.querySelectorAll<HTMLElement>(LONG_MESSAGE_NAVIGATION_CONTENT_SELECTOR))) {
        if (element.closest(LONG_MESSAGE_NAVIGATION_EXCLUDE_SELECTOR)) continue
        return element
    }

    for (const element of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
        if (element.closest(LONG_MESSAGE_NAVIGATION_EXCLUDE_SELECTOR)) continue
        if (!(element.textContent?.trim())) continue
        return element
    }

    return null
}

export function collectLongMessageHeadings(container: ParentNode, idPrefix: string): LongMessageHeading[] {
    const seenIds = new Map<string, number>()
    const headings: LongMessageHeading[] = []
    const usesMarkedContent = Boolean(container.querySelector(LONG_MESSAGE_NAVIGATION_CONTENT_SELECTOR))

    for (const element of Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))) {
        if (element.closest(LONG_MESSAGE_NAVIGATION_EXCLUDE_SELECTOR)) continue
        if (usesMarkedContent && !element.closest(LONG_MESSAGE_NAVIGATION_CONTENT_SELECTOR)) continue

        const label = element.textContent?.trim() ?? ''
        if (!label) continue

        const level = Number(element.tagName.slice(1))
        if (level !== 2 && level !== 3 && level !== 4) continue

        const baseId = element.id.trim() || `${idPrefix}-${normalizeLongMessageHeadingSegment(label)}`
        const seenCount = seenIds.get(baseId) ?? 0
        const nextCount = seenCount + 1
        seenIds.set(baseId, nextCount)

        const uniqueId = seenCount === 0 ? baseId : `${baseId}-${nextCount}`
        if (element.id !== uniqueId) {
            element.id = uniqueId
        }

        headings.push({
            id: uniqueId,
            label,
            level
        })
    }

    return headings
}
