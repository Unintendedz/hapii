import { isClaudeFlavor, isCodexFamilyFlavor } from '@hapi/protocol'

export { isCodexFamilyFlavor, isClaudeFlavor }

export function isCursorFlavor(flavor?: string | null): boolean {
    return flavor === 'cursor'
}

export function isKnownFlavor(flavor?: string | null): boolean {
    return isClaudeFlavor(flavor) || isCodexFamilyFlavor(flavor) || isCursorFlavor(flavor)
}
