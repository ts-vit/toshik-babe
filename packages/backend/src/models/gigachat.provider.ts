import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type { ChatMessage, ChatOptions, ChatResponse, ModelProvider, StreamChunk } from "./types";

const DEFAULT_MODEL = "GigaChat:latest";
const GIGACHAT_BASE_URL = "https://gigachat.devices.sberbank.ru/api/v1";
const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const DEFAULT_SCOPE = "GIGACHAT_API_PERS";
const AUTH_TIMEOUT_MS = 10_000;

interface TokenData {
  accessToken: string;
  expiresAt: number;
}

export class GigaChatProvider implements ModelProvider {
  readonly id = "gigachat" as const;

  private readonly openai: ReturnType<typeof createOpenAI>;
  private readonly defaultModel: string;
  private readonly credentials: string;
  private readonly scope: string;
  private tokenData: TokenData | null = null;
  private tokenPromise: Promise<TokenData> | null = null;

  constructor(apiKey?: string, defaultModel?: string) {
    const key = apiKey ?? process.env["GIGACHAT_API_KEY"];
    if (!key) {
      throw new Error(
        "GigaChatProvider: API key is required. " +
          "Set GIGACHAT_API_KEY env variable or pass apiKey to constructor.",
      );
    }
    this.credentials = key;
    this.scope = process.env["GIGACHAT_SCOPE"] ?? DEFAULT_SCOPE;
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
    this.openai = createOpenAI({
      apiKey: "oauth-managed",
      baseURL: GIGACHAT_BASE_URL,
      fetch: (async (url, init) => {
        const token = await this.getAccessToken();
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);
        const res = await fetch(url, { ...init, headers });
        if (res.status === 401) {
          this.tokenData = null;
          this.tokenPromise = null;
        }
        return res;
      }) as typeof fetch,
    });
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.tokenData &&
      Date.now() < this.tokenData.expiresAt - TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.tokenData.accessToken;
    }
    if (!this.tokenPromise) {
      this.tokenPromise = this.fetchToken();
    }
    this.tokenData = await this.tokenPromise;
    this.tokenPromise = null;
    return this.tokenData.accessToken;
  }

  private async fetchToken(): Promise<TokenData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    const oauthHeaders = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${this.credentials}`,
    });
    const doFetch = async (): Promise<Response> => {
      oauthHeaders.set("RqUID", crypto.randomUUID());
      return fetch(GIGACHAT_AUTH_URL, {
        method: "POST",
        headers: oauthHeaders,
        body: new URLSearchParams({ scope: this.scope }).toString(),
        signal: controller.signal,
      });
    };
    try {
      let res = await doFetch();
      if (!res.ok && res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await doFetch();
      }
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.text();
        const msg = `GigaChat OAuth failed: ${res.status} ${res.statusText}${body ? " - " + body : ""}`;
        console.error("[GigaChat]", msg);
        throw new Error(msg);
      }
      const data = (await res.json()) as {
        access_token?: string;
        expires_at?: number;
        expires_in?: number;
      };
      const accessToken = data.access_token;
      if (!accessToken) {
        throw new Error("GigaChat OAuth: invalid response (missing access_token)");
      }
      // GigaChat может вернуть expires_at (Unix sec) или expires_in (секунды до истечения)
      const now = Date.now();
      const expiresAt =
        typeof data.expires_at === "number"
          ? data.expires_at * 1000
          : typeof data.expires_in === "number"
            ? now + data.expires_in * 1000
            : now + 25 * 60 * 1000; // 25 мин по умолчанию
      return {
        accessToken,
        expiresAt,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) throw err;
      throw new Error(String(err));
    }
  }

  /**
   * Build Vercel AI SDK messages from our ChatMessage[], extracting system prompt.
   */
  private buildParams(messages: ChatMessage[], options?: ChatOptions) {
    const modelId = options?.model ?? this.defaultModel;

    // Resolve system prompt: explicit option takes priority, then system-role messages.
    let system: string | undefined = options?.systemPrompt;
    if (!system) {
      const systemMsg = messages.find((m) => m.role === "system");
      system = systemMsg?.content;
    }

    // Filter out system messages — they are passed via the `system` parameter.
    const coreMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    return {
      model: this.openai.chat(modelId),
      system,
      messages: coreMessages,
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const params = this.buildParams(messages, options);

    const result = await generateText(params);

    return {
      text: result.text,
      usage: result.usage
        ? {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
          }
        : undefined,
    };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const params = this.buildParams(messages, options);

    const result = streamText(params);

    for await (const textPart of result.textStream) {
      yield { text: textPart, done: false };
    }

    // Final sentinel chunk
    yield { text: "", done: true };
  }
}
