import type { ReactElement } from 'react'
import { useState, useMemo } from 'react'
import { Search, X, Star, Wrench, Eye, Brain, DollarSign } from 'lucide-react'
import type { ModelProviderCatalogModelV1, FavoritedModel } from '@shared/app-settings'

type Props = {
  t: (key: string) => string
  models: ModelProviderCatalogModelV1[]
  favorites: FavoritedModel[]
  providerId: string
  freeOnly: boolean
  onFreeOnlyChange: (v: boolean) => void
  onToggleFavorite: (providerId: string, modelId: string) => void
  onSelectModel: (modelId: string) => void
  selectedModelId?: string
}

const CONTEXT_BADGE_THRESHOLD = 100_000

export function EnhancedModelPicker({
  t, models, favorites, providerId, freeOnly, onFreeOnlyChange,
  onToggleFavorite, onSelectModel, selectedModelId
}: Props): ReactElement {
  const [search, setSearch] = useState('')

  const favSet = useMemo(() => {
    const s = new Set<string>()
    for (const f of favorites) s.add(`${f.providerId}:${f.modelId}`)
    return s
  }, [favorites])

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        if (!m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false
      }
      if (freeOnly) {
        const price = m.pricingUsdPerMillion
        if (price && (price.input > 0 || price.output > 0)) return false
      }
      return true
    })
  }, [models, search, freeOnly])

  const isFavorite = (modelId: string): boolean => {
    return favSet.has(`${providerId}:${modelId}`)
  }

  const formatContextLength = (length: number | undefined): string | null => {
    if (!length) return null
    if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M`
    return `${Math.round(length / 1000)}K`
  }

  const formatPrice = (price: number | undefined): string => {
    if (!price || price === 0) return t('modelPricingFree')
    if (price < 0.01) return `<$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  const hasPricing = (m: ModelProviderCatalogModelV1): boolean => {
    return !!m.pricingUsdPerMillion
  }

  return (
    <div className="flex flex-col" dir="auto">
      {/* Search + filters */}
      <div className="space-y-2 p-2">
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('modelPickerSearchPlaceholder')}
            className="w-full rounded-lg border border-ds-border bg-ds-card py-1.5 pe-2.5 ps-8 text-[12px] text-ds-ink placeholder:text-ds-faint focus:border-accent/40 focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ds-faint hover:text-ds-ink"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {/* Free filter toggle */}
        <label className="flex items-center gap-2 px-1 text-[12px] text-ds-muted cursor-pointer">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => onFreeOnlyChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-ds-border text-accent focus:ring-accent/20"
          />
          {t('modelFreeFilter')}
        </label>
      </div>

      {/* Model list */}
      <div className="max-h-[320px] overflow-y-auto">
        {filteredModels.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-ds-muted">
            {t('modelPickerNoResults')}
            {search || freeOnly ? (
              <button
                type="button"
                onClick={() => { setSearch(''); onFreeOnlyChange(false) }}
                className="ms-1 text-accent hover:underline"
              >
                {t('modelPickerClearFilters')}
              </button>
            ) : null}
          </div>
        ) : (
          filteredModels.map((m) => {
            const fav = isFavorite(m.id)
            const selected = selectedModelId === m.id
            const ctxLen = formatContextLength(m.contextLength)
            const caps = m.capabilities

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModel(m.id)}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-start transition ${
                  selected ? 'bg-accent/10 text-accent' : 'text-ds-ink hover:bg-ds-hover'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{m.id}</span>
                    {/* Capability badges */}
                    {caps.tools ? (
                      <span className="shrink-0 rounded bg-blue-500/10 px-1 py-0.5 text-[9px] font-medium text-blue-600 dark:text-blue-400" title={t('modelCapabilityTools')}>
                        <Wrench className="me-0.5 inline h-2.5 w-2.5" />{t('modelCapabilityTools')}
                      </span>
                    ) : null}
                    {caps.reasoning ? (
                      <span className="shrink-0 rounded bg-purple-500/10 px-1 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400" title={t('modelCapabilityReasoning')}>
                        <Brain className="me-0.5 inline h-2.5 w-2.5" />{t('modelCapabilityReasoning')}
                      </span>
                    ) : null}
                    {caps.inputModalities.includes('image') || caps.outputModalities.includes('image') ? (
                      <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400" title={t('modelCapabilityVision')}>
                        <Eye className="me-0.5 inline h-2.5 w-2.5" />{t('modelCapabilityVision')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ds-muted">
                    {ctxLen ? (
                      <span className="inline-flex items-center gap-1" title={String(m.contextLength)}>
                        {t('modelContextLength').replace('{{length}}', ctxLen)}
                      </span>
                    ) : null}
                    {hasPricing(m) && m.pricingUsdPerMillion ? (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="h-2.5 w-2.5" />
                        {t('modelPricingPerMillion').replace('{{input}}', formatPrice(m.pricingUsdPerMillion.input)).replace('{{output}}', formatPrice(m.pricingUsdPerMillion.output))}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Favorite toggle */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(providerId, m.id) }}
                  className={`shrink-0 rounded p-1 transition ${fav ? 'text-amber-500 hover:text-amber-600' : 'text-ds-faint hover:text-ds-muted'}`}
                  title={fav ? t('modelRemoveFavorite') : t('modelAddFavorite')}
                >
                  <Star className={`h-3.5 w-3.5 ${fav ? 'fill-current' : ''}`} />
                </button>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
