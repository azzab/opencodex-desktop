import type { ReactElement } from 'react'
import opencodexMark from '../../../../asset/img/opencodex-mark.svg'

export function AnimatedWorkLogo({
  active = false,
  className = '',
  phase = 'lead',
  size = 'sm'
}: {
  active?: boolean
  className?: string
  phase?: 'lead' | 'trail'
  size?: 'sm' | 'md'
}): ReactElement {
  return (
    <span
      className={[
        'ds-work-logo',
        `ds-work-logo-${size}`,
        `ds-work-logo-phase-${phase}`,
        active ? 'is-active' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className="ds-work-logo-orbit ds-work-logo-orbit-back" />
      <span className="ds-work-logo-scan" />
      <span className="ds-work-logo-pulse" />
      <span className="ds-work-logo-track">
        <span className="ds-work-logo-body">
          <img className="ds-work-logo-image" src={opencodexMark} alt="" draggable={false} decoding="async" />
        </span>
      </span>
      <span className="ds-work-logo-spark" />
      <span className="ds-work-logo-orbit ds-work-logo-orbit-front" />
    </span>
  )
}
