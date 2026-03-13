import { useState, useEffect, useRef } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

type ConfirmDialogProps = {
    isOpen: boolean
    onClose: () => void
    title: string
    description: string
    confirmLabel: string
    confirmingLabel: string
    onConfirm: () => Promise<void>
    isPending: boolean
    destructive?: boolean
}

export function ConfirmDialog(props: ConfirmDialogProps) {
    const { t } = useTranslation()
    const {
        isOpen,
        onClose,
        title,
        description,
        confirmLabel,
        confirmingLabel,
        onConfirm,
        isPending,
        destructive = false
    } = props

    const [error, setError] = useState<string | null>(null)
    const confirmButtonRef = useRef<HTMLButtonElement | null>(null)

    // Clear error when dialog opens/closes
    useEffect(() => {
        if (isOpen) {
            setError(null)
        }
    }, [isOpen])

    const handleConfirm = async () => {
        setError(null)
        try {
            await onConfirm()
            onClose()
        } catch (err) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : t('dialog.error.default')
            setError(message)
        }
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (isPending) {
            return
        }
        void handleConfirm()
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' || isPending) {
            return
        }

        const target = event.target as HTMLElement | null
        if (target?.closest('[data-confirm-dialog-cancel="true"]')) {
            return
        }

        event.preventDefault()
        void handleConfirm()
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-sm"
                onKeyDown={handleKeyDown}
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    confirmButtonRef.current?.focus()
                }}
            >
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription className="mt-2">
                            {description}
                        </DialogDescription>
                    </DialogHeader>

                    {error ? (
                        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            {error}
                        </div>
                    ) : null}

                    <div className="mt-4 flex gap-2 justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={isPending}
                            data-confirm-dialog-cancel="true"
                        >
                            {t('button.cancel')}
                        </Button>
                        <Button
                            ref={confirmButtonRef}
                            type="submit"
                            variant={destructive ? 'destructive' : 'secondary'}
                            disabled={isPending}
                        >
                            {isPending ? confirmingLabel : confirmLabel}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
