import type { ReactElement } from 'react'
import {
  Activity,
  FileText,
  Gauge,
  PanelRightClose,
  Paperclip,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Terminal,
  Users
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CoreRuntimeInfoJson } from '../../agent/kun-contract'
import type { AttachmentReference, RuntimeConnectionStatus } from '../../agent/types'
import {
  formatCompactNumber,
  formatCost,
  formatPercent,
  type ThreadUsageSummary
} from '../../hooks/use-thread-usage'
import type { Phase7DiagnosticsResult } from '@shared/phase7-diagnostics'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { LoopsManager } from '../LoopsManager'
import type { LoopRecord } from '../../../../../kun/src/contracts/automations.js'

export type WorkbenchSurfaceMode =
  | 'files'
  | 'terminal'
  | 'diagnostics'
  | 'subagents'
  | 'usage'
  | 'permissions'

export type WorkbenchSurfacePanelProps = {
  surface: WorkbenchSurfaceMode
  workspaceRoot: string
  runtimeConnection: RuntimeConnectionStatus
  runtimeInfo: CoreRuntimeInfoJson | null
  runtimeSkillCount: number
  composerModel: string
  fileReferences: Array<{ path: string; relativePath: string }>
  attachments: AttachmentReference[]
  sideConversations: Array<{ threadId: string; title: string; busy: boolean }>
  usage: ThreadUsageSummary | null
  phase7Diagnostics?: Phase7DiagnosticsResult | null
  className?: string
  onClose: () => void
  /** Loop records for the LoopsManager widget. */
  loops?: LoopRecord[]
  onLoopCreate?: () => void
  onLoopPause?: (id: string) => void
  onLoopResume?: (id: string) => void
  onLoopCancel?: (id: string) => void
  onLoopDelete?: (id: string) => void
}

function fileNameFromPath(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).pop() || path
}

function compactPath(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path || '-'
}

function surfaceTitle(surface: WorkbenchSurfaceMode, t: (key: string) => string): string {
  switch (surface) {
    case 'files':
      return t('surfaceFilesTitle')
    case 'terminal':
      return t('surfaceTerminalTitle')
    case 'diagnostics':
      return t('surfaceDiagnosticsTitle')
    case 'subagents':
      return t('surfaceSubagentsTitle')
    case 'usage':
      return t('surfaceUsageTitle')
    case 'permissions':
      return t('surfacePermissionsTitle')
  }
}

function statusText(value: boolean | undefined, t: (key: string) => string): string {
  return value ? t('surfaceStatusAvailable') : t('surfaceStatusUnavailable')
}

function SurfaceMetric({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail?: string
}): ReactElement {
  return (
    <div className="rounded-lg border border-ds-border-muted bg-ds-card/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0] text-ds-faint">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-ds-ink">{value}</div>
      {detail ? <div className="mt-0.5 truncate text-[11px] text-ds-muted">{detail}</div> : null}
    </div>
  )
}

function SurfaceSection({
  icon,
  title,
  children
}: {
  icon: ReactElement
  title: string
  children: ReactElement
}): ReactElement {
  return (
    <section className="rounded-lg border border-ds-border-muted bg-ds-card/60 p-3">
      <div className="mb-3 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-ds-ink">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ds-subtle text-ds-muted">
          {icon}
        </span>
        <span className="truncate">{title}</span>
      </div>
      {children}
    </section>
  )
}

export function WorkbenchSurfacePanelView({
  surface,
  workspaceRoot,
  runtimeConnection,
  runtimeInfo,
  runtimeSkillCount,
  composerModel,
  fileReferences,
  attachments,
  sideConversations,
  usage,
  phase7Diagnostics,
  className,
  onClose,
  loops,
  onLoopCreate,
  onLoopPause,
  onLoopResume,
  onLoopCancel,
  onLoopDelete
}: WorkbenchSurfacePanelProps): ReactElement {
  const { t, i18n } = useTranslation('common')
  const toolCount = runtimeInfo?.capabilities.mcp.toolCount ?? 0
  const connectedMcp = runtimeInfo?.capabilities.mcp.connectedServers ?? 0
  const configuredMcp = runtimeInfo?.capabilities.mcp.configuredServers ?? 0
  const runningSideConversations = sideConversations.filter((side) => side.busy).length
  const automation = runtimeInfo?.capabilities.automation
  const automationLabel = automation?.enabled
    ? t('surfaceAutomationEnabled')
    : t('surfaceAutomationDisabled')
  const phase7Ok = phase7Diagnostics?.ok ? phase7Diagnostics : null

  const renderFiles = (): ReactElement => (
    <div className="space-y-3">
      <SurfaceSection
        icon={<Search className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfaceFilesSearchTitle')}
      >
        <div className="space-y-2 text-[12px] leading-5 text-ds-muted">
          <p>{t('surfaceFilesSearchBody')}</p>
          <SurfaceMetric
            label={t('surfaceWorkspaceBoundary')}
            value={compactPath(workspaceRoot)}
            detail={workspaceRoot || t('workspaceNotSelected')}
          />
        </div>
      </SurfaceSection>
      <SurfaceSection
        icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfaceFilesReferencesTitle')}
      >
        {fileReferences.length ? (
          <ul className="space-y-1">
            {fileReferences.map((file) => (
              <li
                key={`${file.path}:${file.relativePath}`}
                className="truncate rounded-md bg-ds-subtle px-2 py-1.5 text-[12px] text-ds-ink"
                title={file.path}
              >
                {file.relativePath || fileNameFromPath(file.path)}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-ds-muted">{t('surfaceFilesNoReferences')}</div>
        )}
      </SurfaceSection>
      <SurfaceSection
        icon={<Paperclip className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfaceAttachmentsTitle')}
      >
        {attachments.length ? (
          <ul className="space-y-1">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="truncate rounded-md bg-ds-subtle px-2 py-1.5 text-[12px] text-ds-ink"
              >
                {attachment.name || attachment.id}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-ds-muted">{t('surfaceAttachmentsEmpty')}</div>
        )}
      </SurfaceSection>
    </div>
  )

  const renderTerminal = (): ReactElement => (
    <TerminalPanel workspaceRoot={workspaceRoot} />
  )

  const renderDiagnostics = (): ReactElement => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SurfaceMetric
          label={t('surfaceDiagnosticsSkills')}
          value={t('missionSkillsSummary', { skills: runtimeSkillCount, tools: toolCount })}
        />
        <SurfaceMetric
          label={t('surfaceDiagnosticsMcp')}
          value={t('surfaceMcpServers', { connected: connectedMcp, configured: configuredMcp })}
        />
      </div>
      <SurfaceSection
        icon={<ServerCog className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfaceDiagnosticsRuntimeTitle')}
      >
        <div className="grid grid-cols-1 gap-2 text-[12px]">
          <SurfaceMetric
            label={t('composerModel')}
            value={composerModel || runtimeInfo?.capabilities.model.id || t('missionModelAuto')}
            detail={runtimeInfo?.capabilities.model.inputModalities.join(', ') ?? runtimeConnection}
          />
          <SurfaceMetric
            label={t('surfaceDiagnosticsWeb')}
            value={statusText(runtimeInfo?.capabilities.web.available, t)}
            detail={runtimeInfo?.capabilities.web.provider ?? t('surfaceDiagnosticsProviderUnknown')}
          />
        </div>
      </SurfaceSection>
      {phase7Ok ? (
        <SurfaceSection
          icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('surfacePhase7RegistryTitle')}
        >
          <div className="space-y-2 text-[12px] leading-5 text-ds-muted">
            <SurfaceMetric
              label={t('surfacePhase7SkillsPlugins')}
              value={`${phase7Ok.skills.length} / ${phase7Ok.plugins.length}`}
              detail={[
                ...phase7Ok.skills.slice(0, 3).map((skill) =>
                  `${skill.name} (${skill.scope}${skill.triggers.length ? `: ${skill.triggers.join(', ')}` : ''})`
                ),
                ...phase7Ok.plugins.slice(0, 3).map((plugin) =>
                  `${plugin.name}${plugin.version ? ` ${plugin.version}` : ''}`
                )
              ].join(' | ')}
            />
            <SurfaceMetric
              label={t('surfacePhase7Hooks')}
              value={phase7Ok.hooks.map((hook) => hook.phase).join(', ') || t('surfacePhase7NoDiagnostics')}
              detail={phase7Ok.hooks
                .map((hook) =>
                  `${hook.phase}: ${hook.implemented ? t('surfaceStatusAvailable') : t('surfacePhase7Modeled')}`
                )
                .join(' | ')}
            />
            <SurfaceMetric
              label={t('surfacePhase7Compatibility')}
              value={phase7Ok.compatibilitySources.map((source) => source.label).join(', ')}
              detail={phase7Ok.compatibilitySources
                .map((source) => `${source.label}: ${source.status}`)
                .join(' | ')}
            />
          </div>
        </SurfaceSection>
      ) : null}
    </div>
  )

  const renderSubagents = (): ReactElement => (
    <div className="space-y-3">
      <SurfaceMetric
        label={t('surfaceSubagentsState')}
        value={t('missionSubagentsSummary', {
          running: runningSideConversations,
          total: sideConversations.length
        })}
        detail={t('missionSubagentsCapacity', {
          parallel: runtimeInfo?.capabilities.subagents.maxParallel ?? 0,
          runs: runtimeInfo?.capabilities.subagents.maxChildRuns ?? 0
        })}
      />
      <SurfaceSection
        icon={<Users className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfaceSubagentsSideChats')}
      >
        {sideConversations.length ? (
          <ul className="space-y-1">
            {sideConversations.map((side) => (
              <li
                key={side.threadId}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-ds-subtle px-2 py-1.5 text-[12px]"
              >
                <span className="truncate text-ds-ink">{side.title}</span>
                <span className="shrink-0 text-[11px] text-ds-muted">
                  {side.busy ? t('sidePanelRunningDot') : t('runtimeIdle')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-ds-muted">{t('sidePanelEmpty')}</div>
        )}
      </SurfaceSection>
    </div>
  )

  const renderUsage = (): ReactElement => (
    <div className="space-y-3">
      {usage ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SurfaceMetric
              label={t('surfaceUsageTokens')}
              value={t('missionUsageTokens', { tokens: formatCompactNumber(usage.totalTokens) })}
              detail={t('sessionUsageTurns', { turns: usage.turns })}
            />
            <SurfaceMetric
              label={t('surfaceUsageCost')}
              value={formatCost(usage.costUsd, i18n.language, usage.costCny)}
              detail={t('missionUsageCache', { cache: formatPercent(usage.cacheHitRate) })}
            />
          </div>
          <SurfaceSection
            icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.8} />}
            title={t('surfaceUsageCacheTitle')}
          >
            <div className="grid grid-cols-2 gap-2">
              <SurfaceMetric
                label={t('surfaceUsageCached')}
                value={formatCompactNumber(usage.cachedTokens)}
              />
              <SurfaceMetric
                label={t('surfaceUsageMiss')}
                value={formatCompactNumber(usage.cacheMissTokens)}
              />
            </div>
          </SurfaceSection>
        </>
      ) : (
        <SurfaceSection
          icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('surfaceUsageEmptyTitle')}
        >
          <div className="text-[12px] leading-5 text-ds-muted">{t('sessionUsageUnavailable')}</div>
        </SurfaceSection>
      )}
    </div>
  )

  const renderPermissions = (): ReactElement => (
    <div className="space-y-3">
      <SurfaceMetric
        label={t('surfacePermissionsPolicy')}
        value={`${runtimeInfo?.approvalPolicy || t('missionPolicyUnknown')} / ${runtimeInfo?.sandboxMode || t('missionPolicyUnknown')}`}
        detail={automationLabel}
      />
      <SurfaceSection
        icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('surfacePermissionsAuditTitle')}
      >
        <div className="space-y-2 text-[12px] leading-5 text-ds-muted">
          <p>{t('surfacePermissionsAuditBody')}</p>
          <p>
            {automation?.localDevOnly
              ? t('surfacePermissionsLocalDevOnly')
              : t('surfacePermissionsHostPolicy')}
          </p>
        </div>
      </SurfaceSection>
      <SurfaceSection
        icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />}
        title={t('automationLoopTitle')}
      >
        <LoopsManager
          loops={loops ?? []}
          onCreate={onLoopCreate}
          onPause={onLoopPause}
          onResume={onLoopResume}
          onCancel={onLoopCancel}
          onDelete={onLoopDelete}
        />
      </SurfaceSection>
      {phase7Ok ? (
        <SurfaceSection
          icon={<ServerCog className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('surfacePhase7RulesTitle')}
        >
          <div className="space-y-2 text-[12px] leading-5 text-ds-muted">
            <SurfaceMetric
              label={t('surfacePhase7MemoryScopes')}
              value={phase7Ok.memory.scopes.join(', ')}
              detail={`${t('surfacePhase7MemoryControls')}: ${phase7Ok.memory.controls.join(', ')}`}
            />
            {phase7Ok.rules.length ? (
              <ul className="space-y-1">
                {phase7Ok.rules.slice(0, 5).map((rule) => (
                  <li
                    key={rule.id}
                    className="truncate rounded-md bg-ds-subtle px-2 py-1.5 text-[12px] text-ds-ink"
                    title={rule.redactedPreview}
                  >
                    {rule.source}: {rule.redactedPreview}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-ds-muted">{t('surfacePhase7NoDiagnostics')}</div>
            )}
          </div>
        </SurfaceSection>
      ) : null}
    </div>
  )

  const renderBody = (): ReactElement => {
    switch (surface) {
      case 'files':
        return renderFiles()
      case 'terminal':
        return renderTerminal()
      case 'diagnostics':
        return renderDiagnostics()
      case 'subagents':
        return renderSubagents()
      case 'usage':
        return renderUsage()
      case 'permissions':
        return renderPermissions()
    }
  }

  return (
    <aside
      className={`ds-no-drag ds-panel-ghost flex h-full max-h-full w-full flex-col border-l border-ds-border-muted backdrop-blur-xl ${className ?? ''}`}
    >
      <div className="flex min-h-[58px] shrink-0 items-center gap-3 border-b border-ds-border-muted px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          className="ds-sidebar-toggle-button shrink-0"
          aria-label={t('rightPanelCollapse')}
          title={t('rightPanelCollapse')}
        >
          <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">
            {surfaceTitle(surface, t)}
          </div>
          <div className="mt-1 truncate text-[11px] text-ds-faint">
            {t('surfacePanelSubtitle')}
          </div>
        </div>
        <Activity className="h-4 w-4 shrink-0 text-ds-faint" strokeWidth={1.7} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderBody()}</div>
    </aside>
  )
}

export function WorkbenchSurfacePanel(props: WorkbenchSurfacePanelProps): ReactElement {
  return <WorkbenchSurfacePanelView {...props} />
}
