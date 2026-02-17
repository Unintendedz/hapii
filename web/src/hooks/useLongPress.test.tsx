import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLongPress } from '@/hooks/useLongPress'

function HookHarness(props: {
    onLongPress: (point: { x: number; y: number }) => void
    threshold?: number
}) {
    const handlers = useLongPress({
        onLongPress: props.onLongPress,
        threshold: props.threshold ?? 500
    })

    return (
        <div data-testid="target" {...handlers}>
            Hello selectable text
        </div>
    )
}

describe('useLongPress', () => {
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
        const selection = window.getSelection()
        selection?.removeAllRanges()
    })

    it('cancels long press when mouse moves (text selection gesture)', () => {
        vi.useFakeTimers()
        const onLongPress = vi.fn()
        render(<HookHarness onLongPress={onLongPress} threshold={500} />)
        const target = screen.getByTestId('target')

        fireEvent.mouseDown(target, { button: 0, clientX: 10, clientY: 10 })
        fireEvent.mouseMove(target, { clientX: 40, clientY: 10 })
        vi.advanceTimersByTime(700)

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('does not trigger custom context menu when text is selected inside target', () => {
        const onLongPress = vi.fn()
        render(<HookHarness onLongPress={onLongPress} />)
        const target = screen.getByTestId('target')

        const range = document.createRange()
        range.selectNodeContents(target)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)

        fireEvent.contextMenu(target, { clientX: 20, clientY: 20 })

        expect(onLongPress).not.toHaveBeenCalled()
    })
})
