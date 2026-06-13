import type { ReactElement } from 'react'
import { useState, useCallback } from 'react'
import {
  Brain, Code, Search, Zap, Eye, BookOpen, ChevronDown, Loader2
} from 'lucide-react'
import type {
  ModelProviderSettingsV1,
  ModelProviderProfileV1,
  PerTaskModelAssignment,
  ModelTaskRole,
  FavoritedModel
} from '@shared/app-settings'
import { MODEL_TASK_ROLES } from '@shared/app-settings'
import { SettingsCard, SettingRow, Toggle } from './settings-controls'
import { EnhancedModelPicker } from './EnhancedModelPicker'

type Props = {
  t: (key: string) => string
  tCommon: (key: string) => string
  providerSettings: ModelProviderSettingsV1
  updateProvider: (patch: Partial<ModelProviderSettingsV1> & { providers?: any[] }) => void
}

const ROLE_ICONS: Record<ModelTaskRole, React.ElementType> = {
  'plan': Brain,
  'code': Code,
  'review': Search,
  'cheap-subagent': Zap,
  'vision': Eye,
  'long-context': BookOpen
}

const ROLE_LABELS: Record<ModelTaskRole, string> = {
  'plan': 'perTaskModelRolePlan',
  'code': 'perTaskModelRoleCode',
  'review': 'perTaskModelRoleReview',
  'cheap-subagent': 'perTaskModelRoleCheapSubagent',
  'vision': 'perTaskModelRoleVision',
  'long-context': 'perTaskModelRoleLongContext'
}

const ROLE_DESCS: Record<ModelTaskRole, string> = {
  'plan': 'perTaskModelRolePlanDesc',
  'code': 'perTaskModelRoleCodeDesc',
  'review': 'perTaskModelRoleReviewDesc',
  'cheap-subagent': 'perTaskModelRoleCheapSubagentDesc',
  'vision': 'perTaskModelRoleVisionDesc',
  'long-context': 'perTaskModelRoleLongContextDesc'
}

export function PerTaskModelSettingsSection({ t, tCommon, providerSettings, updateProvider }: Props): ReactElement {
  const perTask = providerSettings.perTaskModel
  const assignments = perTask.assignments

  const getAssignment = useCallback((role: ModelTaskRole): PerTaskModelAssignment | undefined => {
    return assignments.find((a) => a.role === role)
  }, [assignments])

  const updateAssignment = useCallback((role: ModelTaskRole, patch: Partial<PerTaskModelAssignment>) => {
    const existing = getAssignment(role)
    const newAssignments = existing
      ? assignments.map((a) => a.role === role ? { ...a, ...patch } : a)
      : [...assignments, { role, providerId: '', modelId: '', enabled: true, ...patch }]
    updateProvider({ perTaskModel: { ...perTask, assignments: newAssignments } })
  }, [assignments, perTask, updateProvider, getAssignment])

  const handleToggleEnabled = useCallback((enabled: boolean) => {
    updateProvider({ perTaskModel: { ...perTask, enabled } })
  }, [perTask, updateProvider])

  const handleModelFavoriteToggle = useCallback((providerId: string, modelId: string) => {
    if (typeof window.dsGui?.toggleModelFavorite === 'function') {
      window.dsGui.toggleModelFavorite({ providerId, modelId }).catch(() => {})
    }
  }, [])

  return (
    <SettingsCard title={t('perTaskModelTitle')}>
      <p className="px-4 py-3 text-[13px] text-ds-muted">{t('perTaskModelDesc')}</p>

      <SettingRow
        title={t('perTaskModelEnabled')}
        control={<Toggle checked={perTask.enabled} onChange={handleToggleEnabled} />}
      />

      {perTask.enabled ? (
        <div className="divide-y divide-ds-border-muted">
          {MODEL_TASK_ROLES.map((role) => {
            const assignment = getAssignment(role)
            const enabled = assignment?.enabled ?? false
            const selectedProviderId = assignment?.providerId || ''
            const selectedModelId = assignment?.modelId || ''
            const Icon = ROLE_ICONS[role]

            // Find models for the selected provider
            const selectedProvider = providerSettings.providers.find((p) => p.id === selectedProviderId)
            const availableModels = selectedProvider?.catalogModels ?? []
            const favorites: FavoritedModel[] = providerSettings.modelPicker?.favorites ?? []

            return (
              <div key={role} className="px-2 py-3">
                <div className="flex items-start justify-between gap-3 px-2">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      <Icon className="h-4 w-4 text-ds-muted" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold text-ds-ink">{t(ROLE_LABELS[role])}</h4>
                      <p className="mt-0.5 text-[12px] text-ds-muted">{t(ROLE_DESCS[role])}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={enabled}
                    onChange={(v) => updateAssignment(role, { enabled: v })}
                  />
                </div>

                {enabled ? (
                  <div className="mt-2 space-y-2 px-8">
                    {/* Provider selector */}
                    <div>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => {
                          const pid = e.target.value
                          updateAssignment(role, { providerId: pid, modelId: '' })
                        }}
                        className="w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12px] text-ds-ink focus:border-accent/40 focus:outline-none"
                      >
                        <option value="">{t('perTaskModelUseDefault')}</option>
                        {providerSettings.providers
                          .filter((p) => (p.credentialStatus === 'connected' || p.catalogModels.length > 0))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Model picker (only shown when a provider is selected) */}
                    {selectedProviderId && availableModels.length > 0 ? (
                      <div className="rounded-lg border border-ds-border bg-ds-card/50">
                        <EnhancedModelPicker
                          t={t}
                          models={availableModels}
                          favorites={favorites}
                          providerId={selectedProviderId}
                          freeOnly={false}
                          onFreeOnlyChange={() => {}}
                          onToggleFavorite={handleModelFavoriteToggle}
                          onSelectModel={(modelId) => updateAssignment(role, { modelId })}
                          selectedModelId={selectedModelId}
                        />
                      </div>
                    ) : null}

                    {/* Show current assignment */}
                    {selectedModelId ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-ds-subtle px-2.5 py-1 text-[12px] text-ds-ink">
                        <span className="font-mono text-[11px]">{selectedModelId}</span>
                        {selectedProvider ? <span className="text-ds-faint">via {selectedProvider.name}</span> : null}
                      </div>
                    ) : selectedProviderId ? (
                      <p className="text-[11px] text-ds-muted">{t('perTaskModelUseDefault')}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </SettingsCard>
  )
}
