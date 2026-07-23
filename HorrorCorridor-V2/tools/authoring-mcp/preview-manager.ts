import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  DEFAULT_AUTHORING_PREVIEW,
  validateAuthoringPreviewConfig,
} from "../../src/authoring/previewSnapshot";
import type {
  AuthoringCameraPreset,
  AuthoringPreviewConfig,
} from "../../src/authoring/contracts";
import {
  APP_ROOT,
  AUTHORING_ARTIFACT_ROOT,
  REPO_ROOT,
  AuthoringStateStore,
} from "./state-store";
import { AuthoringDomainError } from "./errors";

type PreviewSession = {
  id: string;
  contentId: string;
  config: AuthoringPreviewConfig;
  page: Page;
  createdAt: string;
  updatedAt: string;
  captures: string[];
  errors: string[];
};

export type PreviewSessionStatus = Readonly<{
  sessionId: string;
  contentId: string;
  config: AuthoringPreviewConfig;
  ready: boolean;
  createdAt: string;
  updatedAt: string;
  captureRefs: readonly string[];
  errors: readonly string[];
}>;

const DEFAULT_PORT = 4175;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function artifactRef(path: string): string {
  return relative(REPO_ROOT, path).replaceAll("\\", "/");
}

function toQuery(config: AuthoringPreviewConfig): string {
  const params = new URLSearchParams({
    authoring: "1",
    setPiece: config.setPieceId,
    district: config.districtId,
    monster: config.monsterId,
    phase: config.phase,
    camera: config.cameraPreset,
  });
  return params.toString();
}

export class AuthoringPreviewManager {
  private browser: Browser | null = null;
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private sessions = new Map<string, PreviewSession>();
  private captureRefs = new Map<string, string>();
  private counter = 1;
  private readonly port = Number(process.env.HORROR_AUTHORING_PREVIEW_PORT ?? DEFAULT_PORT);
  private readonly baseUrl = `http://127.0.0.1:${this.port}`;

  constructor(private readonly store: AuthoringStateStore) {}

  async open(input: {
    contentId: string;
    config?: Partial<AuthoringPreviewConfig>;
  }): Promise<PreviewSessionStatus> {
    const config = validateAuthoringPreviewConfig({
      ...DEFAULT_AUTHORING_PREVIEW,
      ...(input.config ?? {}),
    });
    await this.ensureHost();
    const browser = await this.ensureBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const sessionId = `preview-${Date.now().toString(36)}-${String(this.counter++).padStart(3, "0")}`;
    const createdAt = new Date().toISOString();
    const session: PreviewSession = {
      id: sessionId,
      contentId: input.contentId,
      config,
      page,
      createdAt,
      updatedAt: createdAt,
      captures: [],
      errors: [],
    };
    page.on("pageerror", (error) => session.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") session.errors.push(message.text());
    });
    page.on("crash", () => session.errors.push("Browser page crashed."));

    try {
      await page.goto(`${this.baseUrl}/?${toQuery(config)}`, { waitUntil: "networkidle", timeout: 20_000 });
      await page.waitForFunction(
        () => window.__HORROR_CORRIDOR_AUTHORING__?.status().ready === true,
        undefined,
        { timeout: 10_000 },
      );
      this.sessions.set(sessionId, session);
      await this.persist(session, "preview-opened");
      return this.statusOf(session);
    } catch (error) {
      await page.close().catch(() => undefined);
      throw new AuthoringDomainError(
        "PREVIEW_OPEN_FAILED",
        `Focused preview failed to open: ${(error as Error).message}`,
        true,
        undefined,
        { cause: error },
      );
    }
  }

  async update(
    sessionId: string,
    update: Partial<AuthoringPreviewConfig>,
  ): Promise<PreviewSessionStatus> {
    const session = this.requireSession(sessionId);
    this.assertPageAvailable(session);
    const config = validateAuthoringPreviewConfig({ ...session.config, ...update });
    await session.page.evaluate((value) => {
      const control = window.__HORROR_CORRIDOR_AUTHORING__;
      if (!control) throw new Error("Authoring preview control is unavailable.");
      control.configure(value);
    }, config);
    session.config = config;
    session.updatedAt = new Date().toISOString();
    await this.waitForFrames(session.page);
    await this.persist(session, "preview-updated");
    return this.statusOf(session);
  }

  async capture(
    sessionId: string,
    cameraPreset?: AuthoringCameraPreset,
  ): Promise<Readonly<{ session: PreviewSessionStatus; artifactRef: string; absolutePath: string }>> {
    const session = this.requireSession(sessionId);
    this.assertPageAvailable(session);
    if (cameraPreset && cameraPreset !== session.config.cameraPreset) {
      await this.update(sessionId, { cameraPreset });
    }
    await this.waitForFrames(session.page);
    const outputDirectory = resolve(AUTHORING_ARTIFACT_ROOT, "previews", session.id);
    await mkdir(outputDirectory, { recursive: true });
    const filename = `${session.config.cameraPreset}-${Date.now()}.png`;
    const absolutePath = resolve(outputDirectory, filename);
    await session.page.locator('[data-testid="authoring-preview-canvas"]').screenshot({
      path: absolutePath,
      type: "png",
    });
    const ref = artifactRef(absolutePath);
    session.captures.push(ref);
    this.captureRefs.set(`${session.id}/${filename}`, ref);
    session.updatedAt = new Date().toISOString();
    await this.persist(session, "preview-captured", { artifactRef: ref });
    return Object.freeze({ session: this.statusOf(session), artifactRef: ref, absolutePath });
  }

  async close(sessionId: string): Promise<Readonly<{ sessionId: string; closed: boolean }>> {
    const session = this.requireSession(sessionId);
    this.sessions.delete(sessionId);
    await session.page.close();
    session.updatedAt = new Date().toISOString();
    await this.persist(session, "preview-closed", { closed: true });
    return Object.freeze({ sessionId, closed: true });
  }

  list(): readonly PreviewSessionStatus[] {
    return Object.freeze([...this.sessions.values()].map((session) => this.statusOf(session)));
  }

  get(sessionId: string): PreviewSessionStatus {
    return this.statusOf(this.requireSession(sessionId));
  }

  async readCapture(ref: string): Promise<Readonly<{ mimeType: "image/png"; blob: string }>> {
    const normalized = ref.replaceAll("\\", "/");
    const known = [...this.captureRefs.values()].includes(normalized)
      || [...this.sessions.values()].some((session) => session.captures.includes(normalized));
    if (!known) throw new AuthoringDomainError("PREVIEW_IMAGE_NOT_FOUND", `Unknown preview capture: ${basename(ref)}`);
    const absolute = resolve(REPO_ROOT, normalized);
    const buffer = await readFile(absolute);
    return Object.freeze({ mimeType: "image/png", blob: buffer.toString("base64") });
  }

  listCaptures(): readonly Readonly<{ sessionId: string; captureName: string; artifactRef: string }>[] {
    return Object.freeze([...this.captureRefs.entries()].map(([key, ref]) => {
      const separator = key.indexOf("/");
      return Object.freeze({
        sessionId: key.slice(0, separator),
        captureName: key.slice(separator + 1),
        artifactRef: ref,
      });
    }));
  }

  captureRef(sessionId: string, captureName: string): string | null {
    return this.captureRefs.get(`${sessionId}/${captureName}`) ?? null;
  }

  async shutdown(): Promise<void> {
    const pages = [...this.sessions.values()].map((session) => session.page.close().catch(() => undefined));
    await Promise.all(pages);
    this.sessions.clear();
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    if (this.serverProcess) {
      this.serverProcess.kill("SIGTERM");
      this.serverProcess = null;
    }
  }

  async ensureHostReady(): Promise<string> {
    await this.ensureHost();
    return this.baseUrl;
  }

  private async ensureHost(): Promise<void> {
    if (await this.hostResponds()) return;
    if (!this.serverProcess) {
      const child = spawn("npm", ["run", "dev", "--", "--port", String(this.port), "--strictPort"], {
        cwd: APP_ROOT,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => console.error(`[authoring-preview] ${String(chunk).trim()}`));
      child.stderr.on("data", (chunk) => console.error(`[authoring-preview] ${String(chunk).trim()}`));
      child.on("exit", (code) => {
        if (this.serverProcess === child) this.serverProcess = null;
        if (code && code !== 0) console.error(`[authoring-preview] Vite exited with ${code}.`);
      });
      this.serverProcess = child;
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await this.hostResponds()) return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }
    throw new Error(`Private authoring preview host did not become ready on ${this.baseUrl}.`);
  }

  private async hostResponds(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(800) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch({
      headless: true,
      ...(existsSync(CHROME_PATH) ? { executablePath: CHROME_PATH } : {}),
    });
    this.browser.on("disconnected", () => {
      this.browser = null;
      for (const session of this.sessions.values()) session.errors.push("Browser process disconnected.");
    });
    return this.browser;
  }

  private requireSession(sessionId: string): PreviewSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AuthoringDomainError(
        "PREVIEW_SESSION_NOT_FOUND",
        `Unknown or closed preview session: ${sessionId}`,
        true,
      );
    }
    return session;
  }

  private assertPageAvailable(session: PreviewSession): void {
    if (session.page.isClosed() || session.errors.some((error) => /crash|disconnected/i.test(error))) {
      throw new AuthoringDomainError(
        "PREVIEW_UNAVAILABLE",
        `Preview browser is unavailable for ${session.id}. Reopen the focused preview.`,
        true,
        { errors: session.errors },
      );
    }
  }

  private statusOf(session: PreviewSession): PreviewSessionStatus {
    return Object.freeze({
      sessionId: session.id,
      contentId: session.contentId,
      config: session.config,
      ready: !session.page.isClosed() && session.errors.length === 0,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      captureRefs: Object.freeze([...session.captures]),
      errors: Object.freeze([...session.errors]),
    });
  }

  private async waitForFrames(page: Page): Promise<void> {
    await page.evaluate(() => new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    }));
  }

  private async persist(
    session: PreviewSession,
    event: string,
    detail: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const status = this.statusOf(session);
    await this.store.transaction(event, { sessionId: session.id, ...detail }, (tx) => {
      tx.write(this.store.previewPath(session.id), status);
      return null;
    });
  }
}
