import { generateText, streamText } from "ai";
import { createOllama } from "ollama-ai-provider";

import type { ChatMessage, ChatOptions, ChatResponse, ModelProvider, StreamChunk } from "./types";

const DEFAULT_MODEL = "llama3";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434/api";

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama" as const;

  private readonly ollama: ReturnType<typeof createOllama>;
  private readonly defaultModel: string;

  constructor(baseURL?: string, defaultModel?: string) {
    const url = baseURL ?? process.env["OLLAMA_BASE_URL"] ?? DEFAULT_BASE_URL;
    this.ollama = createOllama({ baseURL: url });
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
      model: this.ollama(modelId),
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
