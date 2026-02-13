import { isClaudeFlavor, isCodexFamilyFlavor } from '@hapi/protocol'

export { isCodexFamilyFlavor, isClaudeFlavor }

export function isKnownFlavor(flavor?: string | null): boolean {
    return isClaudeFlavor(flavor) || isCodexFamilyFlavor(flavor)
}
