/**
 * ThreadHostBadge — displays a badge in the chat thread header when a turn
 * is executing on a remote runner host.
 */
import type { ReactElement } from 'react'
import { Server, Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Remote runner connection/execution status — shared copy for renderer components. */
export type ThreadHostStatus = 'idle' | 'connecting' | 'handshaking' | 'connected' | 'executing' | 'paused' | 'error'

export type ThreadHostBadgeProps = {
  /** Whether a remote runner is active for this thread. */
  active: boolean
  /** The host label (e.g. "Build runner"). */
  hostLabel?: string
  /** Connection status of the remote host. */
  status?: ThreadHostStatus
  /** The host id for tooltip. */
  hostId?: string
  className?: string
}

function statusIcon(status?: ThreadHostStatus): ReactElement {
  switch (status) {
    case 'connected':
    case 'executing':
      return <Wifi className="h-3 w-3" strokeWidth={2} />
    case 'connecting':
    case 'handshaking':
      return <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
    case 'paused':
      return <WifiOff className="h-3 w-3" strokeWidth={2} />
    case 'error':
      return <AlertCircle className="h-3 w-3 text-ds-error" strokeWidth={2} />
    default:
      return <Server className="h-3 w-3" strokeWidth={2} />
  }
}

function statusLabelKey(status: ThreadHostStatus | undefined): string {
  switch (status) {
    case 'connected':
      return 'remoteRunnerStatusConnected'
    case 'executing':
      return 'remoteRunnerStatusExecuting'
    case 'connecting':
      return 'remoteRunnerStatusConnecting'
    case 'handshaking':
      return 'remoteRunnerStatusHandshaking'
    case 'paused':
      return 'remoteRunnerStatusPaused'
    case 'error':
      return 'remoteRunnerStatusError'
    default:
      return 'remoteRunnerStatusIdle'
  }
}

export function ThreadHostBadge({
  active,
  hostLabel,
  status,
  hostId,
  className
}: ThreadHostBadgeProps): ReactElement | null {
  const { t } = useTranslation('settings')

  if (!active) return null

  const displayLabel = hostLabel ?? hostId ?? t('remoteRunners')
  const statusText = t(statusLabelKey(status))

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium
        ${status === 'error' ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15' : ''}
        ${status === 'executing' ? 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/15' : ''}
        ${!status || status === 'idle' ? 'bg-ds-subtle text-ds-muted' : ''}
        ${status === 'connected' ? 'bg-green-500/10 text-green-500 dark:bg-green-500/15' : ''}
        ${className ?? ''}
      `}
      title={`${displayLabel} — ${statusText}`}
    >
      {statusIcon(status)}
      <span className="max-w-[120px] truncate">
        {displayLabel}
      </span>
    </span>
  )
}
