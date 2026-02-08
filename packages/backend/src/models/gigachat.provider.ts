import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type { ChatMessage, ChatOptions, ChatResponse, ModelProvider, StreamChunk } from "./types";

const DEFAULT_MODEL = "GigaChat:latest";
const GIGACHAT_BASE_URL = "https://gigachat.devices.sberbank.ru/api/v1";

export class GigaChatProvider implements ModelProvider {
  readonly id = "gigachat" as const;

  private readonly openai: ReturnType<typeof createOpenAI>;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    const key = apiKey ?? process.env["GIGACHAT_API_KEY"];
    if (!key) {
      throw new Error(
        "GigaChatProvider: API key is required. " +
          "Set GIGACHAT_API_KEY env variable or pass apiKey to constructor.",
      );
    }
    this.openai = createOpenAI({
      apiKey: key,
      baseURL: GIGACHAT_BASE_URL,
    });
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
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
      model: this.openai(modelId),
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
