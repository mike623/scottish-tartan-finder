/**
 * Minimal polite HTTP client for crawling the Scottish Register of Tartans.
 *
 * Crawl-safety requirements (see docs/source-investigation.md and PRD §18-19):
 * - Descriptive User-Agent identifying this project.
 * - Concurrency 1: all requests are serialized through an internal queue.
 * - A minimum delay between the start of consecutive requests.
 * - Retry with exponential backoff (max 3 attempts) on network errors,
 *   HTTP 429, and HTTP 5xx.
 * - Structured logging of every request: timestamp, url, status, duration,
 *   attempt, and outcome.
 */

export interface FetchResult {
  url: string;
  status: number;
  body: string;
  durationMs: number;
}

export interface LogEntry {
  timestamp: string;
  url: string;
  status: number | null;
  durationMs: number;
  attempt: number;
  result: "ok" | "retry" | "fail";
}

export interface HttpClientOptions {
  /** Descriptive User-Agent sent with every request. */
  userAgent?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Minimum delay between the start of consecutive requests (rate limit). */
  delayMs?: number;
  /** Maximum number of attempts per request (initial attempt + retries). */
  maxRetries?: number;
  /** Structured log sink. Defaults to console.error so stdout stays clean for JSON output. */
  log?: (entry: LogEntry) => void;
}

export const DEFAULT_USER_AGENT = "TartanIndexer/1.0 (Scottish Tartan Finder POC)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function defaultLogger(entry: LogEntry): void {
  const status = entry.status === null ? "ERR" : String(entry.status);
  console.error(
    `[http] ${entry.timestamp} result=${entry.result} status=${status} attempt=${entry.attempt} duration=${entry.durationMs}ms ${entry.url}`,
  );
}

/**
 * HttpClient enforces concurrency-1, rate-limited, retrying GET requests.
 * All calls to `get()` share a single internal queue: a second call does not
 * start its request until the previous one has fully settled and the
 * inter-request delay has elapsed.
 */
export class HttpClient {
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly delayMs: number;
  private readonly maxRetries: number;
  private readonly log: (entry: LogEntry) => void;

  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(options: HttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.delayMs = options.delayMs ?? 2000;
    this.maxRetries = options.maxRetries ?? 3;
    this.log = options.log ?? defaultLogger;
  }

  /** GET a URL. Requests are serialized (concurrency 1) and rate limited. */
  get(url: string): Promise<FetchResult> {
    const run = this.queue.then(() => this.runWithRetries(url));
    // Keep the queue alive even if this request ultimately fails, so the
    // next queued request still runs.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async waitForSlot(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestStartedAt;
    const remaining = this.delayMs - elapsed;
    if (remaining > 0) {
      await sleep(remaining);
    }
  }

  private async runWithRetries(url: string): Promise<FetchResult> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.maxRetries) {
      attempt += 1;
      await this.waitForSlot();
      this.lastRequestStartedAt = Date.now();
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
          response = await fetch(url, {
            headers: {
              "User-Agent": this.userAgent,
              Accept: "text/html,application/xhtml+xml,*/*",
            },
            redirect: "follow",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const durationMs = Date.now() - start;

        if (response.status === 429 || response.status >= 500) {
          const willRetry = attempt < this.maxRetries;
          this.log({
            timestamp: new Date().toISOString(),
            url,
            status: response.status,
            durationMs,
            attempt,
            result: willRetry ? "retry" : "fail",
          });
          if (!willRetry) {
            throw new Error(`HTTP ${response.status} for ${url} after ${attempt} attempt(s)`);
          }
          await this.backoff(attempt);
          continue;
        }

        const body = await response.text();
        this.log({
          timestamp: new Date().toISOString(),
          url,
          status: response.status,
          durationMs,
          attempt,
          result: "ok",
        });
        return { url, status: response.status, body, durationMs };
      } catch (err) {
        lastError = err;
        const durationMs = Date.now() - start;
        const willRetry = attempt < this.maxRetries;
        this.log({
          timestamp: new Date().toISOString(),
          url,
          status: null,
          durationMs,
          attempt,
          result: willRetry ? "retry" : "fail",
        });
        if (!willRetry) break;
        await this.backoff(attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  }

  /** Exponential backoff: delayMs * 2^attempt. */
  private async backoff(attempt: number): Promise<void> {
    await sleep(this.delayMs * 2 ** attempt);
  }
}
