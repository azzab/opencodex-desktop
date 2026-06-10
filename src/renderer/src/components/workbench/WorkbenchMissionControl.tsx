import type { ComponentType, ReactElement } from 'react'
import {
  ClipboardList,
  FileText,
  FolderOpen,
  Gauge,
  Globe2,
  Paperclip,
  ShieldCheck,
  Terminal,
  Users,
  Wrench
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CoreRuntimeInfoJson } from '../../agent/kun-contract'
import type { RuntimeConnectionStatus, ThreadGoal, ThreadTodoList } from '../../agent/types'
import {
  formatCompactNumber,
  formatCost,
  formatPercent,
  type ThreadUsageSummary
} from '../../hooks/use-thread-usage'
import type { RightPanelMode } from '../chat/WorkbenchTopBar'

export type WorkbenchMissionControlProps = {
  workspaceLabel: string
  workspaceRoot?: string
  runtimeConnection: RuntimeConnectionStatus
  activeThreadTitle?: string | null
  activeThreadMode?: string | null
  activeGoal?: ThreadGoal | null
  activeTodos?: ThreadTodoList | null
  planAvailable: boolean
  rightPanelMode: RightPanelMode
  sideChatCount: number
  sideChatRunningCount: number
  runtimeInfo: CoreRuntimeInfoJson | null
  runtimeSkillCount: number
  composerModel: string
  usage: ThreadUsageSummary | null
  attachmentCount: number
  fileReferenceCount: number
  hasDevPreview: boolean
  onOpenFiles: () => void
  onOpenTodo: () => void
  onOpenPlan: () => void
  onOpenChanges: () => void
  onOpenTerminal: () => void
  onOpenBrowser: () => void
  onOpenDiagnostics: () => void
  onOpenSubagents: () => void
  onOpenUsage: () => void
  onOpenPlugins: () => void
  onOpenSettings: () => void
}

type MissionTile = {
  key: string
  label: string
  value: string
  detail: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  active?: boolean
  disabled?: boolean
  ariaLabel?: string
  onClick?: () => void
}

function countByStatus(todos: ThreadTodoList | null | undefined, status: 'in_progress' | 'pending' | 'completed'): number {
  return (todos?.items ?? []).filter((item) => item.status === status).length
}

function runtimeConnectionLabel(
  status: RuntimeConnectionStatus,
  t: (key: string) => string
): string {
  if (status === 'ready') return t('runtimeReadyShort')
  if (status === 'checking') return t('runtimeCheckingShort')
  if (status === 'offline') return t('runtimeOfflineShort')
  return t('runtimeIdle')
}

function compactPath(path: string | undefined): string {
  const normalized = path?.trim().replaceAll('\\', '/') ?? ''
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function MissionControlTile({ tile }: { tile: MissionTile }): ReactElement {
  const Icon = tile.icon
  const className = `ds-mission-tile${tile.active ? ' is-active' : ''}`
  const content = (
    <>
      <span className="ds-mission-tile-icon" aria-hidden="true">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      <span className="ds-mission-tile-copy">
        <span className="ds-mission-tile-label">{tile.label}</span>
        <span className="ds-mission-tile-value">{tile.value}</span>
        <span className="ds-mission-tile-detail">{tile.detail}</span>
      </span>
    </>
  )

  if (tile.onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-label={tile.ariaLabel}
        disabled={tile.disabled}
        onClick={tile.onClick}
      >
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

export function WorkbenchMissionControlView(props: WorkbenchMissionControlProps): ReactElement {
  const { t, i18n } = useTranslation('common')
  const activeTodoCount = countByStatus(props.activeTodos, 'in_progress')
  const totalTodoCount = props.activeTodos?.items.length ?? 0
  const capabilityModel = props.runtimeInfo?.capabilities.model.id
  const composerModel = props.composerModel.trim() || capabilityModel || t('missionModelAuto')
  const toolCount = props.runtimeInfo?.capabilities.mcp.toolCount ?? 0
  const connectedMcp = props.runtimeInfo?.capabilities.mcp.connectedServers ?? 0
  const configuredMcp = props.runtimeInfo?.capabilities.mcp.configuredServers ?? 0
  const maxParallel = props.runtimeInfo?.capabilities.subagents.maxParallel ?? 0
  const maxChildRuns = props.runtimeInfo?.capabilities.subagents.maxChildRuns ?? 0
  const approvalPolicy = props.runtimeInfo?.approvalPolicy || t('missionPolicyUnknown')
  const sandboxMode = props.runtimeInfo?.sandboxMode || t('missionPolicyUnknown')
  const automationStatus = props.runtimeInfo?.capabilities.automation?.available
    ? t('missionAutomationAvailable')
    : t('missionAutomationLocalOnly')
  const usageTokens = props.usage
    ? t('missionUsageTokens', { tokens: formatCompactNumber(props.usage.totalTokens) })
    : t('sessionUsageUnavailable')
  const usageDetail = props.usage
    ? [
        formatCost(props.usage.costUsd, i18n.language, props.usage.costCny),
        t('missionUsageCache', { cache: formatPercent(props.usage.cacheHitRate) })
      ].join(' / ')
    : t('missionUsageAwaiting')
  const workspaceValue = props.workspaceLabel.trim() || t('workspaceNotSelected')
  const workspaceDetail = compactPath(props.workspaceRoot) || runtimeConnectionLabel(props.runtimeConnection, t)
  const goalStatus = props.activeGoal
    ? t(`goalStatusShort.${props.activeGoal.status}`, { defaultValue: props.activeGoal.status })
    : t('missionNoGoal')
  const planStatus = props.planAvailable ? t('missionPlanAvailable') : t('missionPlanCreate')
  const todoStatus = t('missionTodoCounts', {
    active: activeTodoCount,
    total: totalTodoCount
  })

  const tiles: MissionTile[] = [
    {
      key: 'project',
      label: t('missionProject'),
      value: workspaceValue,
      detail: `${runtimeConnectionLabel(props.runtimeConnection, t)} / ${workspaceDetail}`,
      icon: FolderOpen
    },
    {
      key: 'thread',
      label: t('missionThread'),
      value: props.activeGoal?.objective || props.activeThreadTitle || t('noThread'),
      detail: `${todoStatus} / ${planStatus} / ${goalStatus}`,
      icon: ClipboardList,
      active: Boolean(props.activeGoal) || props.rightPanelMode === 'todo' || props.rightPanelMode === 'plan',
      ariaLabel: t('missionOpenTodo'),
      onClick: props.onOpenTodo
    },
    {
      key: 'files',
      label: t('missionFiles'),
      value: t('missionFilesSummary', {
        files: props.fileReferenceCount,
        images: props.attachmentCount
      }),
      detail: t('missionFilesDetail'),
      icon: Paperclip,
      active: props.rightPanelMode === 'files',
      ariaLabel: t('missionOpenFiles'),
      onClick: props.onOpenFiles
    },
    {
      key: 'diff',
      label: t('missionDiff'),
      value: t('missionDiffValue'),
      detail: props.rightPanelMode === 'changes' ? t('missionPanelOpen') : t('missionPanelReady'),
      icon: FileText,
      active: props.rightPanelMode === 'changes',
      ariaLabel: t('missionOpenChanges'),
      onClick: props.onOpenChanges
    },
    {
      key: 'terminal',
      label: t('missionTerminal'),
      value: t('missionTerminalValue'),
      detail: t('missionTerminalDetail'),
      icon: Terminal,
      active: props.rightPanelMode === 'terminal',
      ariaLabel: t('missionOpenTerminal'),
      onClick: props.onOpenTerminal
    },
    {
      key: 'browser',
      label: t('missionBrowser'),
      value: props.hasDevPreview ? t('missionBrowserPreviewReady') : t('missionBrowserEvidence'),
      detail: props.rightPanelMode === 'browser' ? t('missionPanelOpen') : t('missionPanelReady'),
      icon: Globe2,
      active: props.rightPanelMode === 'browser',
      ariaLabel: t('missionOpenBrowser'),
      onClick: props.onOpenBrowser
    },
    {
      key: 'skills',
      label: t('missionSkills'),
      value: t('missionSkillsSummary', {
        skills: props.runtimeSkillCount,
        tools: toolCount
      }),
      detail: t('missionMcpSummary', {
        connected: connectedMcp,
        configured: configuredMcp,
        model: composerModel
      }),
      icon: Wrench,
      ariaLabel: t('missionOpenPlugins'),
      active: props.rightPanelMode === 'diagnostics',
      onClick: props.onOpenDiagnostics
    },
    {
      key: 'subagents',
      label: t('missionSubagents'),
      value: t('missionSubagentsSummary', {
        running: props.sideChatRunningCount,
        total: props.sideChatCount
      }),
      detail: t('missionSubagentsCapacity', {
        parallel: maxParallel,
        runs: maxChildRuns
      }),
      icon: Users,
      active: props.rightPanelMode === 'subagents',
      ariaLabel: t('missionOpenSubagents'),
      onClick: props.onOpenSubagents
    },
    {
      key: 'usage',
      label: t('missionUsage'),
      value: usageTokens,
      detail: usageDetail,
      icon: Gauge,
      active: props.rightPanelMode === 'usage',
      ariaLabel: t('missionOpenUsage'),
      onClick: props.onOpenUsage
    },
    {
      key: 'permissions',
      label: t('missionPermissions'),
      value: `${approvalPolicy} / ${sandboxMode}`,
      detail: automationStatus,
      icon: ShieldCheck,
      ariaLabel: t('missionOpenPermissions'),
      active: props.rightPanelMode === 'permissions',
      onClick: props.onOpenSettings
    }
  ]

  return (
    <nav className="ds-mission-control ds-no-drag" aria-label={t('missionControlLabel')}>
      <div className="ds-mission-control-grid">
        {tiles.map((tile) => (
          <MissionControlTile key={tile.key} tile={tile} />
        ))}
      </div>
    </nav>
  )
}

export function WorkbenchMissionControl(props: WorkbenchMissionControlProps): ReactElement {
  return <WorkbenchMissionControlView {...props} />
}
