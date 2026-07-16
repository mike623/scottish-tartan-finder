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
  /**
   * Max requests in flight at once ("detail workers"). Default 1.
   * NOTE: this only overlaps response-wait time — request *starts* are always
   * spaced by `delayMs`, so raising concurrency never exceeds the polite rate
   * of 1 request / delayMs. Against a single live .gov.uk host, keep this low.
   * Clamped to MAX_SAFE_CONCURRENCY.
   */
  concurrency?: number;
  /** Structured log sink. Defaults to console.error so stdout stays clean for JSON output. */
  log?: (entry: LogEntry) => void;
}

export const DEFAULT_USER_AGENT = "TartanIndexer/1.0 (Scottish Tartan Finder POC)";

// ponytail: hard ceiling on parallel detail fetches. The target is a live
// government site; 30-wide fan-out reads as an attack and the min-delay gate
// means it wouldn't go faster anyway. Raise this only with deliberate intent.
export const MAX_SAFE_CONCURRENCY = 6;

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
  private readonly concurrency: number;
  private readonly log: (entry: LogEntry) => void;

  private active = 0;
  private readonly pending: Array<() => void> = [];
  private nextSlot = 0;

  constructor(options: HttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.delayMs = options.delayMs ?? 2000;
    this.maxRetries = options.maxRetries ?? 3;
    const requested = options.concurrency ?? 1;
    this.concurrency = Math.min(Math.max(1, requested), MAX_SAFE_CONCURRENCY);
    if (requested > this.concurrency) {
      console.error(
        `[http] requested concurrency ${requested} clamped to ${this.concurrency} — this is a polite crawler for a live .gov.uk source. Request starts are still spaced by ${this.delayMs}ms regardless of concurrency.`,
      );
    }
    this.log = options.log ?? defaultLogger;
  }

  /**
   * GET a URL. At most `concurrency` requests run at once, and request *starts*
   * are always spaced by at least `delayMs` (so the aggregate rate is bounded
   * by the delay, not the worker count).
   */
  get(url: string): Promise<FetchResult> {
    return this.withSlot(() => this.runWithRetries(url));
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.pending.push(resolve));
  }

  private release(): void {
    const next = this.pending.shift();
    if (next) {
      next(); // hand this slot straight to the next waiter; active unchanged
    } else {
      this.active -= 1;
    }
  }

  /**
   * Reserve the next rate-limited start slot. Reserves synchronously so
   * concurrent callers get sequential, delayMs-spaced start times.
   */
  private async reserveStartSlot(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + this.delayMs;
    const wait = start - now;
    if (wait > 0) await sleep(wait);
  }

  private async runWithRetries(url: string): Promise<FetchResult> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.maxRetries) {
      attempt += 1;
      await this.reserveStartSlot();
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
