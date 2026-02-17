import type React from 'react'
import { useCallback, useRef } from 'react'

type UseLongPressOptions = {
    onLongPress: (point: { x: number; y: number }) => void
    onClick?: () => void
    threshold?: number
    disabled?: boolean
}

type UseLongPressHandlers = {
    onMouseDown: React.MouseEventHandler
    onMouseMove: React.MouseEventHandler
    onMouseUp: React.MouseEventHandler
    onMouseLeave: React.MouseEventHandler
    onTouchStart: React.TouchEventHandler
    onTouchEnd: React.TouchEventHandler
    onTouchMove: React.TouchEventHandler
    onContextMenu: React.MouseEventHandler
    onKeyDown: React.KeyboardEventHandler
}

export function useLongPress(options: UseLongPressOptions): UseLongPressHandlers {
    const { onLongPress, onClick, threshold = 500, disabled = false } = options

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isLongPressRef = useRef(false)
    const movedRef = useRef(false)
    const pressPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const startTimer = useCallback((clientX: number, clientY: number) => {
        if (disabled) return

        clearTimer()
        isLongPressRef.current = false
        movedRef.current = false
        pressPointRef.current = { x: clientX, y: clientY }

        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true
            onLongPress(pressPointRef.current)
        }, threshold)
    }, [disabled, clearTimer, onLongPress, threshold])

    const handleEnd = useCallback((shouldTriggerClick: boolean) => {
        clearTimer()

        if (shouldTriggerClick && !isLongPressRef.current && !movedRef.current && onClick) {
            onClick()
        }

        isLongPressRef.current = false
        movedRef.current = false
    }, [clearTimer, onClick])

    const onMouseDown = useCallback<React.MouseEventHandler>((e) => {
        if (e.button !== 0) return
        startTimer(e.clientX, e.clientY)
    }, [startTimer])

    const onMouseMove = useCallback<React.MouseEventHandler>((e) => {
        if (!timerRef.current) return

        const { x, y } = pressPointRef.current
        const movedEnough = Math.abs(e.clientX - x) > 4 || Math.abs(e.clientY - y) > 4
        if (!movedEnough) return

        movedRef.current = true
        clearTimer()
    }, [clearTimer])

    const onMouseUp = useCallback<React.MouseEventHandler>(() => {
        handleEnd(!isLongPressRef.current)
    }, [handleEnd])

    const onMouseLeave = useCallback<React.MouseEventHandler>(() => {
        handleEnd(false)
    }, [handleEnd])

    const onTouchStart = useCallback<React.TouchEventHandler>((e) => {
        const touch = e.touches[0]
        startTimer(touch.clientX, touch.clientY)
    }, [startTimer])

    const onTouchEnd = useCallback<React.TouchEventHandler>((e) => {
        if (isLongPressRef.current) {
            e.preventDefault()
        }
        handleEnd(!isLongPressRef.current)
    }, [handleEnd])

    const onTouchMove = useCallback<React.TouchEventHandler>(() => {
        movedRef.current = true
        clearTimer()
    }, [clearTimer])

    const hasSelectedTextInsideTarget = useCallback((target: EventTarget | null): boolean => {
        if (typeof window === 'undefined') return false
        if (!(target instanceof Node)) return false

        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            return false
        }
        if (selection.toString().trim().length === 0) {
            return false
        }

        for (let i = 0; i < selection.rangeCount; i += 1) {
            const range = selection.getRangeAt(i)
            if (range.intersectsNode(target)) {
                return true
            }
        }
        return false
    }, [])

    const onContextMenu = useCallback<React.MouseEventHandler>((e) => {
        if (hasSelectedTextInsideTarget(e.currentTarget)) {
            return
        }
        if (!disabled) {
            e.preventDefault()
            clearTimer()
            isLongPressRef.current = true
            onLongPress({ x: e.clientX, y: e.clientY })
        }
    }, [disabled, clearTimer, onLongPress, hasSelectedTextInsideTarget])

    const onKeyDown = useCallback<React.KeyboardEventHandler>((e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
        }
    }, [disabled, onClick])

    return {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onTouchStart,
        onTouchEnd,
        onTouchMove,
        onContextMenu,
        onKeyDown
    }
}
