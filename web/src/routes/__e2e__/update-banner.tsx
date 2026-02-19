import { markUpdateAvailable } from '@/lib/sw-update'

const LOAD_COUNT_KEY = 'hapi:e2e:update-banner:load-count'
const PAGE_LOAD_MARKER = '__hapi_e2e_update_banner_load_marked__'

function readAndIncrementLoadCount(): number {
    const globalState = window as unknown as Record<string, unknown>
    if (globalState[PAGE_LOAD_MARKER] === true) {
        const existing = Number(sessionStorage.getItem(LOAD_COUNT_KEY) ?? '0')
        return Number.isFinite(existing) ? existing : 0
    }
    const currentRaw = sessionStorage.getItem(LOAD_COUNT_KEY)
    const current = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0
    const next = current + 1
    sessionStorage.setItem(LOAD_COUNT_KEY, String(next))
    globalState[PAGE_LOAD_MARKER] = true
    return next
}

export default function E2EUpdateBannerPage() {
    const loadCount = readAndIncrementLoadCount()

    return (
        <div className="flex h-dvh w-dvw flex-col gap-3 bg-[var(--app-bg)] p-4 text-[var(--app-fg)]">
            <div className="text-sm font-semibold">E2E update banner harness</div>
            <div data-testid="load-count" className="font-mono text-xs opacity-80">{loadCount}</div>
            <button
                type="button"
                data-testid="trigger-update"
                className="w-fit rounded-md bg-[var(--app-button)] px-3 py-2 text-sm text-[var(--app-button-text)]"
                onClick={() => {
                    markUpdateAvailable('e2e-build')
                }}
            >
                trigger update banner
            </button>
        </div>
    )
}
