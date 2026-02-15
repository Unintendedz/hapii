import { useAppUpdate } from '@/hooks/useAppUpdate'
import { useTranslation } from '@/lib/use-translation'

export function UpdateBanner() {
    const { t } = useTranslation()
    const { updateAvailable, applyUpdate } = useAppUpdate()

    if (!updateAvailable) {
        return null
    }

    return (
        <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white text-center py-2 text-sm font-medium z-50 flex items-center justify-center gap-3">
            <span>{t('update.message')}</span>
            <button
                type="button"
                className="rounded bg-white/20 px-3 py-0.5 text-xs font-semibold hover:bg-white/30 transition-colors"
                onClick={applyUpdate}
            >
                {t('update.button')}
            </button>
        </div>
    )
}
