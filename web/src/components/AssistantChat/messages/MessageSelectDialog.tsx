import { useEffect, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type MessageSelectDialogProps = {
    isOpen: boolean
    onClose: () => void
    text: string
}

export function MessageSelectDialog(props: MessageSelectDialogProps) {
    const { t } = useTranslation()
    const { isOpen, onClose, text } = props
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const { copy } = useCopyToClipboard()

    useEffect(() => {
        if (!isOpen) return

        const timer = window.setTimeout(() => {
            const el = textareaRef.current
            if (!el) return
            el.focus()
            el.setSelectionRange(0, el.value.length)
        }, 50)

        return () => window.clearTimeout(timer)
    }, [isOpen])

    const handleCopy = async () => {
        const el = textareaRef.current
        if (!el) {
            await copy(text)
            return
        }

        const start = el.selectionStart ?? 0
        const end = el.selectionEnd ?? 0
        const selected = start !== end ? el.value.slice(start, end) : el.value
        await copy(selected)
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('message.action.selectText')}</DialogTitle>
                </DialogHeader>

                <div className="mt-3">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        readOnly
                        className="h-[60vh] w-full resize-none rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-sm text-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                    />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('button.close')}
                    </Button>
                    <Button type="button" onClick={handleCopy}>
                        {t('button.copy')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

