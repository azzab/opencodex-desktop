/**
 * Minimal ambient type declarations for the optional 'playwright' package.
 * These stubs keep the typecheck green when playwright is not installed.
 * At runtime, the real Playwright types are used through dynamic import.
 */

declare module 'playwright' {
  interface Browser {
    newContext(opts?: { viewport?: { width: number; height: number } }): Promise<BrowserContext>
    close(): Promise<void>
  }
  interface BrowserContext {
    newPage(): Promise<Page>
    close(): Promise<void>
    on(event: 'console', handler: (msg: ConsoleMessage) => void): void
  }
  interface Page {
    isClosed(): boolean
    close(): Promise<void>
    goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>
    title(): Promise<string>
    url(): string
    click(selector: string, opts?: { timeout?: number }): Promise<void>
    fill(selector: string, text: string, opts?: { timeout?: number }): Promise<void>
    screenshot(opts?: { type?: string; fullPage?: boolean }): Promise<Buffer>
    evaluate<R>(pageFunction: string | Function, arg?: unknown): Promise<R>
    waitForTimeout(ms: number): Promise<void>
    on(event: 'request', handler: (req: Request) => void): void
  }
  interface ConsoleMessage {
    type(): string
    text(): string
    location(): { url: string }
  }
  interface Request {
    method(): string
    url(): string
    response(): Promise<Response | null>
  }
  interface Response {
    status(): number
    statusText(): string
  }
  export const chromium: {
    launch(opts?: { headless?: boolean; args?: string[] }): Promise<Browser>
  }
}
