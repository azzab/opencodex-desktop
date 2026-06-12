import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react'

export type GoalStatusChipProps = {
  status: 'active' | 'evaluating' | 'done' | 'blocked' | 'paused' | 'usageLimited' | 'budgetLimited' | 'complete'
  tokenBudget?: number | null
  tokensUsed?: number
  className?: string
}

export function GoalStatusChip({ status, tokenBudget, tokensUsed, className }: GoalStatusChipProps): ReactElement | null {
  const { t } = useTranslation()

  const statusConfig: Record<GoalStatusChipProps['status'], {
    icon: ReactElement
    label: string
    bg: string
    text: string
    border: string
  }> = {
    active: {
      icon: <Activity size={12} />,
      label: t('goalStatusActive', 'Active'),
      bg: 'bg-blue-500/10',
      text: 'text-blue-600 dark:text-blue-300',
      border: 'border-blue-500/25'
    },
    evaluating: {
      icon: <Clock size={12} className="animate-pulse" />,
      label: t('goalStatusEvaluating', 'Evaluating'),
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-500/25'
    },
    done: {
      icon: <CheckCircle2 size={12} />,
      label: t('goalStatusDone', 'Done'),
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-300',
      border: 'border-emerald-500/25'
    },
    blocked: {
      icon: <AlertTriangle size={12} />,
      label: t('goalStatusBlocked', 'Blocked'),
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-300',
      border: 'border-red-500/25'
    },
    paused: {
      icon: <Clock size={12} />,
      label: t('goalStatusPaused', 'Paused'),
      bg: 'bg-ds-card',
      text: 'text-ds-faint',
      border: 'border-ds-border-muted'
    },
    usageLimited: {
      icon: <AlertTriangle size={12} />,
      label: t('goalStatusUsageLimited', 'Usage limit'),
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-500/25'
    },
    budgetLimited: {
      icon: <XCircle size={12} />,
      label: t('goalStatusBudgetLimited', 'Budget limit'),
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-300',
      border: 'border-red-500/25'
    },
    complete: {
      icon: <CheckCircle2 size={12} />,
      label: t('goalStatusComplete', 'Complete'),
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-200',
      border: 'border-emerald-500/30'
    }
  }

  const config = statusConfig[status]

  const budgetMeter = tokenBudget != null && tokenBudget > 0 && tokensUsed != null
    ? (
      <span className="inline-flex items-center gap-1 ms-2">
        <span
          className="block h-1 rounded-full bg-ds-border-muted overflow-hidden"
          style={{ width: 48 }}
          role="meter"
          aria-valuenow={tokensUsed}
          aria-valuemin={0}
          aria-valuemax={tokenBudget}
          aria-label={t('goalBudgetMeter', '{{used}} / {{budget}} tokens', { used: tokensUsed, budget: tokenBudget })}
        >
          <span
            className="block h-full rounded-full bg-current transition-all"
            style={{
              width: `${Math.min(100, (tokensUsed / tokenBudget) * 100)}%`,
              opacity: tokensUsed / tokenBudget > 0.8 ? 0.6 : 0.3
            }}
          />
        </span>
        <span className="text-[10px] tabular-nums opacity-60">
          {tokensUsed >= 1000 ? `${(tokensUsed / 1000).toFixed(1)}k` : tokensUsed}
          /
          {tokenBudget >= 1000 ? `${(tokenBudget / 1000).toFixed(1)}k` : tokenBudget}
        </span>
      </span>
    )
    : null

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${config.bg} ${config.text} ${config.border} ${className ?? ''}`.trim()}
      title={config.label}
    >
      {config.icon}
      <span className="font-medium">{config.label}</span>
      {budgetMeter}
    </span>
  )
}
