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

export function collectLongMessageHeadings(container: ParentNode, idPrefix: string): LongMessageHeading[] {
    const seenIds = new Map<string, number>()
    const headings: LongMessageHeading[] = []

    for (const element of Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))) {
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
