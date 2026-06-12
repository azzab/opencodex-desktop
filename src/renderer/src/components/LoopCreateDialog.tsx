import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Timer, Brain, CalendarClock, ShieldCheck, Folder } from 'lucide-react'
import { CLAW_MODEL_IDS } from '@shared/app-settings-types'
import type {
  LoopRecord,
  LoopScheduleKind,
  LoopCatchUpPolicy,
  LoopQueuePolicy
} from '../../../../kun/src/contracts/automations.js'

export type LoopCreateDraft = {
  projectId: string
  threadTemplateId: string
  prompt: string
  model: string
  scheduleKind: LoopScheduleKind
  everyMinutes: number
  cronExpression: string
  atTime: string
  catchUpPolicy: LoopCatchUpPolicy
  queuePolicy: LoopQueuePolicy
  expiryRuns: number | undefined
  expiryDate: string
  maxRuns: number | undefined
}

const SCHEDULE_KINDS: LoopScheduleKind[] = ['interval', 'cron', 'at']
const CATCH_UP_OPTIONS: LoopCatchUpPolicy[] = ['skip', 'burst']
const QUEUE_OPTIONS: LoopQueuePolicy[] = ['queue', 'skip']

export function newLoopDraft(
  defaults: {
    projectId?: string
    threadTemplateId?: string
    model?: string
  } = {}
): LoopCreateDraft {
  return {
    projectId: defaults.projectId ?? 'default',
    threadTemplateId: defaults.threadTemplateId ?? '',
    prompt: '',
    model: defaults.model ?? 'deepseek-v4-pro',
    scheduleKind: 'interval',
    everyMinutes: 60,
    cronExpression: '0 9 * * *',
    atTime: '',
    catchUpPolicy: 'skip',
    queuePolicy: 'queue',
    expiryRuns: undefined,
    expiryDate: '',
    maxRuns: undefined
  }
}

export function validateLoopDraft(
  draft: LoopCreateDraft,
  t: (key: string, values?: Record<string, unknown>) => string
): string | null {
  if (!draft.prompt.trim()) return t('loopDialogErrorPromptRequired')
  if (draft.prompt.length > 8_000) return t('loopDialogErrorPromptTooLong')
  if (!draft.projectId.trim()) return t('loopDialogErrorProjectRequired')
  if (!draft.threadTemplateId.trim()) return t('loopDialogErrorThreadRequired')

  if (draft.scheduleKind === 'interval') {
    if (!Number.isFinite(draft.everyMinutes) || draft.everyMinutes < 1) {
      return t('loopDialogErrorIntervalInvalid')
    }
  }
  if (draft.scheduleKind === 'cron') {
    if (!draft.cronExpression.trim()) {
      return t('loopDialogErrorCronRequired')
    }
  }
  if (draft.scheduleKind === 'at') {
    const at = Date.parse(draft.atTime)
    if (!Number.isFinite(at)) return t('loopDialogErrorAtInvalid')
    if (at <= Date.now()) return t('loopDialogErrorAtPast')
  }

  if (draft.maxRuns !== undefined && draft.maxRuns < 1) {
    return t('loopDialogErrorMaxRunsInvalid')
  }
  if (draft.expiryRuns !== undefined && draft.expiryRuns < 1) {
    return t('loopDialogErrorExpiryRunsInvalid')
  }

  return null
}

export function draftToCreateRequest(draft: LoopCreateDraft): {
  projectId: string
  threadTemplateId: string
  prompt: string
  model: string
  schedule: LoopRecord['schedule']
  catchUpPolicy: LoopCatchUpPolicy
  queuePolicy: LoopQueuePolicy
  expiryRuns?: number
  expiryDate?: string
  maxRuns?: number
} {
  const schedule: LoopRecord['schedule'] = (() => {
    switch (draft.scheduleKind) {
      case 'interval':
        return { kind: 'interval', everyMinutes: draft.everyMinutes }
      case 'cron':
        return { kind: 'cron', cronExpression: draft.cronExpression.trim() }
      case 'at':
        return { kind: 'at', atTime: draft.atTime }
    }
  })()

  return {
    projectId: draft.projectId.trim(),
    threadTemplateId: draft.threadTemplateId.trim(),
    prompt: draft.prompt.trim(),
    model: draft.model,
    schedule,
    catchUpPolicy: draft.catchUpPolicy,
    queuePolicy: draft.queuePolicy,
    expiryRuns: draft.expiryRuns,
    expiryDate: draft.expiryDate.trim() || undefined,
    maxRuns: draft.maxRuns
  }
}

export type LoopCreateDialogProps = {
  draftDefaults?: { projectId?: string; threadTemplateId?: string; model?: string }
  onClose: () => void
  onSubmit: (draft: LoopCreateDraft) => void
}

export function LoopCreateDialog({
  draftDefaults,
  onClose,
  onSubmit
}: LoopCreateDialogProps): ReactElement {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<LoopCreateDraft>(() => newLoopDraft(draftDefaults))
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<LoopCreateDraft>): void => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  const handleSubmit = (): void => {
    const validation = validateLoopDraft(draft, t)
    if (validation) {
      setError(validation)
      return
    }
    onSubmit(draft)
  }

  return (
    <div
      className="ds-no-drag fixed inset-0 z-[90] flex items-center justify-center bg-black/58 px-4"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="loop-create-dialog-title"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-[22px] border border-white/55 bg-ds-card shadow-[0_30px_90px_rgba(15,23,42,0.28)] dark:border-white/10"
        dir="auto"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-ds-border-muted px-6 py-3">
          <h2 id="loop-create-dialog-title" className="text-[17px] font-semibold text-ds-ink">
            {t('loopDialogTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
            aria-label={t('close')}
            title={t('close')}
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4">
            {/* Prompt */}
            <LoopDialogSection
              icon={<Timer className="h-4 w-4" strokeWidth={1.8} />}
              title={t('loopDialogSectionPrompt')}
            >
              <label className="grid gap-2">
                <LoopFieldLabel required>{t('loopDialogPrompt')}</LoopFieldLabel>
                <div className="relative">
                  <textarea
                    value={draft.prompt}
                    maxLength={8_000}
                    onChange={(event) => update({ prompt: event.target.value })}
                    placeholder={t('loopDialogPromptPlaceholder')}
                    className="min-h-[96px] w-full resize-y rounded-xl border border-ds-border bg-ds-main/55 px-3 py-3 pb-8 text-[14px] leading-6 text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                    dir="auto"
                  />
                  <span className="pointer-events-none absolute bottom-3 end-3 text-[12px] text-ds-faint">
                    {draft.prompt.length}/8000
                  </span>
                </div>
              </label>
            </LoopDialogSection>

            {/* Context: project + thread template */}
            <LoopDialogSection
              icon={<Folder className="h-4 w-4" strokeWidth={1.8} />}
              title={t('loopDialogSectionContext')}
            >
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <LoopFieldLabel required>{t('loopDialogProjectId')}</LoopFieldLabel>
                  <input
                    value={draft.projectId}
                    onChange={(event) => update({ projectId: event.target.value })}
                    placeholder="default"
                    className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                    dir="auto"
                  />
                </label>
                <label className="grid gap-2">
                  <LoopFieldLabel required>{t('loopDialogThreadTemplate')}</LoopFieldLabel>
                  <input
                    value={draft.threadTemplateId}
                    onChange={(event) => update({ threadTemplateId: event.target.value })}
                    placeholder={t('loopDialogThreadTemplatePlaceholder')}
                    className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                    dir="auto"
                  />
                </label>
              </div>
            </LoopDialogSection>

            {/* Model */}
            <LoopDialogSection
              icon={<Brain className="h-4 w-4" strokeWidth={1.8} />}
              title={t('loopDialogSectionModel')}
            >
              <label className="grid gap-2">
                <LoopFieldLabel required>{t('loopDialogModel')}</LoopFieldLabel>
                <select
                  value={draft.model}
                  onChange={(event) => update({ model: event.target.value })}
                  className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                >
                  {CLAW_MODEL_IDS.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
            </LoopDialogSection>

            {/* Schedule */}
            <LoopDialogSection
              icon={<CalendarClock className="h-4 w-4" strokeWidth={1.8} />}
              title={t('loopDialogSectionSchedule')}
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <LoopFieldLabel required>{t('loopDialogScheduleKind')}</LoopFieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {SCHEDULE_KINDS.map((kind) => (
                      <LoopSegmentButton
                        key={kind}
                        selected={draft.scheduleKind === kind}
                        onClick={() => update({ scheduleKind: kind })}
                      >
                        {t(`loopDialogScheduleKind_${kind}`)}
                      </LoopSegmentButton>
                    ))}
                  </div>
                </div>

                {draft.scheduleKind === 'interval' ? (
                  <label className="grid gap-2">
                    <LoopFieldLabel required>{t('loopDialogEveryMinutes')}</LoopFieldLabel>
                    <input
                      type="number"
                      min={1}
                      max={10080}
                      value={draft.everyMinutes}
                      onChange={(event) => update({ everyMinutes: Number(event.target.value) })}
                      className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                    />
                  </label>
                ) : draft.scheduleKind === 'cron' ? (
                  <label className="grid gap-2">
                    <LoopFieldLabel required>{t('loopDialogCronExpression')}</LoopFieldLabel>
                    <input
                      value={draft.cronExpression}
                      onChange={(event) => update({ cronExpression: event.target.value })}
                      placeholder="0 9 * * *"
                      className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                      dir="ltr"
                    />
                  </label>
                ) : (
                  <label className="grid gap-2">
                    <LoopFieldLabel required>{t('loopDialogAtTime')}</LoopFieldLabel>
                    <input
                      type="datetime-local"
                      value={draft.atTime}
                      onChange={(event) => update({ atTime: event.target.value })}
                      className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                    />
                  </label>
                )}
              </div>
            </LoopDialogSection>

            {/* Policies and limits */}
            <LoopDialogSection
              icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.8} />}
              title={t('loopDialogSectionPolicies')}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {/* Catch-up */}
                <div className="grid gap-2">
                  <LoopFieldLabel>{t('loopDialogCatchUp')}</LoopFieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {CATCH_UP_OPTIONS.map((policy) => (
                      <LoopSegmentButton
                        key={policy}
                        selected={draft.catchUpPolicy === policy}
                        onClick={() => update({ catchUpPolicy: policy })}
                      >
                        {t(`loopDialogPolicy_${policy}`)}
                      </LoopSegmentButton>
                    ))}
                  </div>
                </div>

                {/* Queue */}
                <div className="grid gap-2">
                  <LoopFieldLabel>{t('loopDialogQueue')}</LoopFieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {QUEUE_OPTIONS.map((policy) => (
                      <LoopSegmentButton
                        key={policy}
                        selected={draft.queuePolicy === policy}
                        onClick={() => update({ queuePolicy: policy })}
                      >
                        {t(`loopDialogPolicy_${policy}`)}
                      </LoopSegmentButton>
                    ))}
                  </div>
                </div>

                {/* Max runs */}
                <label className="grid gap-2">
                  <LoopFieldLabel>{t('loopDialogMaxRuns')}</LoopFieldLabel>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={draft.maxRuns ?? ''}
                    onChange={(event) => {
                      const val = event.target.value
                      update({ maxRuns: val ? Number(val) : undefined })
                    }}
                    placeholder={t('loopDialogUnlimited')}
                    className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                  />
                </label>

                {/* Expiry runs */}
                <label className="grid gap-2">
                  <LoopFieldLabel>{t('loopDialogExpiryRuns')}</LoopFieldLabel>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={draft.expiryRuns ?? ''}
                    onChange={(event) => {
                      const val = event.target.value
                      update({ expiryRuns: val ? Number(val) : undefined })
                    }}
                    placeholder={t('loopDialogUnlimited')}
                    className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                  />
                </label>

                {/* Expiry date */}
                <label className="grid gap-2 md:col-span-2">
                  <LoopFieldLabel>{t('loopDialogExpiryDate')}</LoopFieldLabel>
                  <input
                    type="datetime-local"
                    value={draft.expiryDate}
                    onChange={(event) => update({ expiryDate: event.target.value })}
                    className="h-10 w-full rounded-xl border border-ds-border bg-ds-main/55 px-3 text-[14px] text-ds-ink outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
                  />
                </label>
              </div>
            </LoopDialogSection>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-ds-border-muted bg-ds-card px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-xl border border-ds-border bg-ds-card px-4 text-[13px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="h-8 rounded-xl bg-ds-userbubble px-5 text-[13px] font-semibold text-ds-userbubbleFg transition hover:opacity-90"
          >
            {t('confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}

function LoopDialogSection({
  icon,
  title,
  children
}: {
  icon: ReactElement
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="grid gap-3 border-t border-ds-border-muted pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ds-ink">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ds-subtle text-ds-muted">
          {icon}
        </span>
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function LoopFieldLabel({
  children,
  required = false
}: {
  children: ReactNode
  required?: boolean
}): ReactElement {
  return (
    <span className="flex min-h-5 items-center gap-1 text-[13px] font-medium text-ds-ink">
      <span className="min-w-0 truncate">{children}</span>
      {required ? <span className="text-red-500">*</span> : null}
    </span>
  )
}

function LoopSegmentButton({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 min-w-0 rounded-xl border px-2.5 text-[12.5px] font-semibold transition ${
        selected
          ? 'border-accent/45 bg-accent/10 text-ds-ink shadow-sm'
          : 'border-ds-border bg-ds-main/55 text-ds-muted hover:bg-ds-hover hover:text-ds-ink'
      }`}
    >
      <span className="block truncate">{children}</span>
    </button>
  )
}
