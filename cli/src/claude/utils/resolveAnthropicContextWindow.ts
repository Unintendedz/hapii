import { logger } from '@/ui/logger'

const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_CONTEXT_1M_BETA = 'context-1m-2025-08-07'
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const ONE_M_CONTEXT_SUFFIX = /\[1m\]\s*$/i

const probeCache = new Map<string, Promise<number | null>>()

function stripOneMillionContextSuffix(model: string): string {
    return model.replace(ONE_M_CONTEXT_SUFFIX, '').trim()
}

function isLikelyAnthropicModelId(model: string): boolean {
    return /^(claude-[a-z0-9.-]+|opus|sonnet|haiku)$/i.test(model)
}

function resolveAnthropicApiBaseUrl(): string | null {
    const raw = process.env.ANTHROPIC_BASE_URL?.trim()
    if (!raw) {
        return DEFAULT_ANTHROPIC_BASE_URL
    }

    try {
        const parsed = new URL(raw)
        if (parsed.hostname !== 'api.anthropic.com') {
            return null
        }
        return parsed.origin
    } catch {
        return null
    }
}

async function fetchAnthropicModelInfo(opts: {
    apiKey: string
    baseUrl: string
    modelId: string
    beta?: string
}): Promise<number | null> {
    const headers: Record<string, string> = {
        'anthropic-version': ANTHROPIC_API_VERSION,
        'x-api-key': opts.apiKey
    }

    if (opts.beta) {
        headers['anthropic-beta'] = opts.beta
    }

    let response: Response
    try {
        response = await fetch(`${opts.baseUrl}/v1/models/${encodeURIComponent(opts.modelId)}`, {
            method: 'GET',
            headers
        })
    } catch (error) {
        logger.debug('[anthropic-context-window] Failed to fetch model info', {
            modelId: opts.modelId,
            beta: opts.beta,
            error: error instanceof Error ? error.message : String(error)
        })
        return null
    }

    if (!response.ok) {
        logger.debug('[anthropic-context-window] Models API returned non-OK status', {
            modelId: opts.modelId,
            beta: opts.beta,
            status: response.status
        })
        return null
    }

    let payload: unknown
    try {
        payload = await response.json()
    } catch (error) {
        logger.debug('[anthropic-context-window] Failed to parse model info JSON', {
            modelId: opts.modelId,
            beta: opts.beta,
            error: error instanceof Error ? error.message : String(error)
        })
        return null
    }

    if (!payload || typeof payload !== 'object') {
        return null
    }

    const maxInputTokens = (payload as { max_input_tokens?: unknown }).max_input_tokens
    return typeof maxInputTokens === 'number' && Number.isFinite(maxInputTokens) && maxInputTokens > 0
        ? maxInputTokens
        : null
}

async function probeAnthropicContextWindowTokens(model: string): Promise<number | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    const baseUrl = resolveAnthropicApiBaseUrl()
    if (!baseUrl) {
        return null
    }

    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    const wantsOneMillionContext = ONE_M_CONTEXT_SUFFIX.test(trimmedModel)
    const modelId = stripOneMillionContextSuffix(trimmedModel)
    if (!isLikelyAnthropicModelId(modelId)) {
        return null
    }

    if (wantsOneMillionContext) {
        const oneMillionContextTokens = await fetchAnthropicModelInfo({
            apiKey,
            baseUrl,
            modelId,
            beta: ANTHROPIC_CONTEXT_1M_BETA
        })
        if (oneMillionContextTokens) {
            return oneMillionContextTokens
        }
    }

    return await fetchAnthropicModelInfo({
        apiKey,
        baseUrl,
        modelId
    })
}

export function resolveAnthropicContextWindowTokens(model: string): Promise<number | null> {
    const cacheKey = model.trim()
    const cached = probeCache.get(cacheKey)
    if (cached) {
        return cached
    }

    const pending = probeAnthropicContextWindowTokens(model)
        .catch((error) => {
            logger.debug('[anthropic-context-window] Unexpected probe error', {
                model,
                error: error instanceof Error ? error.message : String(error)
            })
            return null
        })

    probeCache.set(cacheKey, pending)
    return pending
}

export function resetAnthropicContextWindowProbeCacheForTests(): void {
    probeCache.clear()
}
