/**
 * Cross-platform process and filesystem helpers for packaging, CI,
 * and main-process code.  All functions accept an explicit platform so
 * they are testable on any host; callers typically pass process.platform.
 *
 * @module platform-utils
 */

const { spawnSync } = require('node:child_process')

/**
 * Force-kill a process tree by PID, using the best available OS primitive.
 *
 * On Windows this shells out to `taskkill /F /PID <pid> /T` because
 * `process.kill(pid, 'SIGKILL')` does not exist on that platform.  On
 * POSIX it sends SIGKILL directly to the process group.
 *
 * @param {number} pid
 * @param {NodeJS.Platform} [platform=process.platform]
 * @returns {boolean} true if the kill command succeeded (exit 0)
 */
function forceKillPid(pid, platform = process.platform) {
  if (platform === 'win32') {
    const result = spawnSync('taskkill', ['/F', '/PID', String(pid), '/T'], {
      stdio: 'pipe',
      timeout: 10_000
    })
    return result.status === 0 || /not found/i.test(result.stderr?.toString() ?? '')
  }
  try {
    process.kill(-pid, 'SIGKILL')
    return true
  } catch {
    // already dead
    return true
  }
}

/**
 * Best-effort graceful termination: SIGTERM on POSIX, `taskkill` (no /F) on
 * Windows so the process can clean up.
 *
 * @param {number} pid
 * @param {NodeJS.Platform} [platform=process.platform]
 */
function gracefulKillPid(pid, platform = process.platform) {
  if (platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid)], {
      stdio: 'pipe',
      timeout: 5_000
    })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}

/**
 * Kill a child process.  Uses the child's `.kill()` method first (which
 * handles Windows via libuv's TerminateProcess), then falls back to
 * platform-native force-kill by PID.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {'SIGTERM'|'SIGKILL'} signal
 * @param {NodeJS.Platform} [platform=process.platform]
 */
function killChildProcess(child, signal, platform = process.platform) {
  try {
    // Node's child_process.kill maps SIGTERM/SIGKILL to
    // TerminateProcess on Windows (libuv), which is the right thing.
    child.kill(signal)
  } catch {
    // already gone
  }
  if (signal === 'SIGKILL' && child.pid && !child.killed) {
    forceKillPid(child.pid, platform)
  }
}

module.exports = {
  forceKillPid,
  gracefulKillPid,
  killChildProcess
}
