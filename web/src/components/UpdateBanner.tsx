import { useAppUpdate } from '@/hooks/useAppUpdate'
import { useTranslation } from '@/lib/use-translation'

export function UpdateBanner() {
    const { t } = useTranslation()
    const { updateAvailable, applyUpdate } = useAppUpdate()

    if (!updateAvailable) {
        return null
    }

    return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
            <button
                type="button"
                data-testid="update-banner-button"
                className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-700 transition-colors"
                onClick={applyUpdate}
            >
                <span>{t('update.message')}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{t('update.button')}</span>
            </button>
        </div>
    )
}
