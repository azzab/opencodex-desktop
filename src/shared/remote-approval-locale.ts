/**
 * Typed localization helper for the remote approval native dialog.
 *
 * The Electron main process cannot use i18next / react-i18next, so this
 * module provides the locale strings for en, zh, ar directly.
 *
 * All keys preserve explicit REMOTE semantics and include
 * host label/id, command, cwd, and requestedAt.
 */

export type RemoteApprovalLocaleKey = 'en' | 'zh' | 'ar'

export interface RemoteApprovalLocaleStrings {
  dialogTitle: string
  dialogMessage: string
  /** Template fields: {{host}}, {{hostId}}, {{command}}, {{cwd}}, {{time}} */
  dialogDetail: string
  allowLabel: string
  denyLabel: string
  labelRemote: string
  trustContext: string
  errorNoCallback: string
}

const LOCALE_STRINGS: Record<RemoteApprovalLocaleKey, RemoteApprovalLocaleStrings> = {
  en: {
    dialogTitle: 'REMOTE — Command Approval Required',
    dialogMessage: 'REMOTE host "{{host}}" wants to execute a command.',
    dialogDetail: [
      'Host:       {{host}}',
      'Host ID:    {{hostId}}',
      'Command:    {{command}}',
      'Directory:  {{cwd}}',
      'Time:       {{time}}',
      '',
      '⚠️  This command will run on a REMOTE machine, not your local computer.',
      'Only allow commands you fully trust on this remote host.',
    ].join('\n'),
    allowLabel: 'Allow',
    denyLabel: 'Deny',
    labelRemote: 'REMOTE',
    trustContext: 'Trust Context',
    errorNoCallback:
      'Remote execution denied: no approval callback is configured. A visible approval surface is required for remote commands.',
  },
  zh: {
    dialogTitle: '远程 — 需要命令审批',
    dialogMessage: '远程主机 "{{host}}" 请求执行命令。',
    dialogDetail: [
      '主机:       {{host}}',
      '主机 ID:    {{hostId}}',
      '命令:       {{command}}',
      '目录:       {{cwd}}',
      '时间:       {{time}}',
      '',
      '⚠️  此命令将在远程计算机上运行，而非您的本地计算机。',
      '仅允许您完全信任的远程主机命令。',
    ].join('\n'),
    allowLabel: '允许',
    denyLabel: '拒绝',
    labelRemote: '远程',
    trustContext: '信任上下文',
    errorNoCallback:
      '远程执行被拒绝：未配置审批回调。远程命令需要可见的审批界面。',
  },
  ar: {
    dialogTitle: 'عن بعد — الموافقة على الأمر مطلوبة',
    dialogMessage: 'المضيف البعيد "{{host}}" يريد تنفيذ أمر.',
    dialogDetail: [
      'المضيف:       {{host}}',
      'معرف المضيف:  {{hostId}}',
      'الأمر:        {{command}}',
      'المجلد:       {{cwd}}',
      'الوقت:        {{time}}',
      '',
      '⚠️  سيتم تشغيل هذا الأمر على جهاز بعيد، وليس على حاسوبك المحلي.',
      'لا تسمح إلا بالأوامر التي تثق بها تماما على هذا المضيف البعيد.',
    ].join('\n'),
    allowLabel: 'السماح',
    denyLabel: 'رفض',
    labelRemote: 'عن بعد',
    trustContext: 'سياق الثقة',
    errorNoCallback:
      'تم رفض التنفيذ عن بعد: لم يتم تكوين رد اتصال للموافقة. يلزم وجود واجهة موافقة مرئية للأوامر البعيدة.',
  },
}

/**
 * Resolve the current app locale with a safe fallback to 'en'.
 */
export function resolveAppLocale(raw: string | undefined | null): RemoteApprovalLocaleKey {
  const validLocales = new Set<string>(['en', 'zh', 'ar'])
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return validLocales.has(trimmed) ? (trimmed as RemoteApprovalLocaleKey) : 'en'
}

/**
 * Return the localized strings for the given locale. Falls back to 'en'
 * for any unknown locale value.
 */
export function getRemoteApprovalLocale(locale: RemoteApprovalLocaleKey | string): RemoteApprovalLocaleStrings {
  return LOCALE_STRINGS[resolveAppLocale(locale)]
}

/**
 * Render the localized title string (no template parameters).
 */
export function localizedApprovalTitle(locale: RemoteApprovalLocaleKey | string): string {
  return getRemoteApprovalLocale(locale).dialogTitle
}

/**
 * Render the localized message string with {{host}} substitution.
 */
export function localizedApprovalMessage(
  locale: RemoteApprovalLocaleKey | string,
  host: string,
): string {
  const tpl = getRemoteApprovalLocale(locale).dialogMessage
  return tpl.replace(/\{\{host\}\}/g, host)
}

/**
 * Render the localized detail string with all template substitutions:
 * {{host}}, {{hostId}}, {{command}}, {{cwd}}, {{time}}
 */
export function localizedApprovalDetail(
  locale: RemoteApprovalLocaleKey | string,
  params: { host: string; hostId: string; command: string; cwd: string; time: string },
): string {
  let tpl = getRemoteApprovalLocale(locale).dialogDetail
  tpl = tpl.replace(/\{\{host\}\}/g, params.host)
  tpl = tpl.replace(/\{\{hostId\}\}/g, params.hostId)
  tpl = tpl.replace(/\{\{command\}\}/g, params.command)
  tpl = tpl.replace(/\{\{cwd\}\}/g, params.cwd)
  tpl = tpl.replace(/\{\{time\}\}/g, params.time)
  return tpl
}

/**
 * Return the localized button labels: [Deny, Allow] with Deny as index 0 (default/cancel).
 */
export function localizedApprovalButtons(
  locale: RemoteApprovalLocaleKey | string,
): [deny: string, allow: string] {
  const l = getRemoteApprovalLocale(locale)
  return [l.denyLabel, l.allowLabel]
}
