import { generateText, streamText, type CoreMessage, type ImagePart, type TextPart } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { readFileSync } from "node:fs";

import type { ChatMessage, ChatOptions, ChatResponse, ModelProvider, StreamChunk } from "./types";

const DEFAULT_MODEL = "gemini-2.0-flash";

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini" as const;

  private readonly google: ReturnType<typeof createGoogleGenerativeAI>;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    const key = apiKey ?? process.env["GOOGLE_GENAI_API_KEY"];
    if (!key) {
      throw new Error(
        "GeminiProvider: API key is required. " +
          "Set GOOGLE_GENAI_API_KEY env variable or pass apiKey to constructor.",
      );
    }
    this.google = createGoogleGenerativeAI({ apiKey: key });
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  /**
   * Build Vercel AI SDK messages from our ChatMessage[], extracting system prompt.
   * Messages with attachments produce multimodal content (text + image parts).
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
    const coreMessages: CoreMessage[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const hasAttachments = m.attachments && m.attachments.length > 0;

        if (hasAttachments && m.role === "user") {
          // Build multimodal content: images + text.
          const parts: (TextPart | ImagePart)[] = [];

          for (const att of m.attachments!) {
            try {
              const data = readFileSync(att.filePath);
              parts.push({
                type: "image" as const,
                image: data,
                mimeType: att.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              });
            } catch (err) {
              console.error(`[gemini] Failed to read attachment ${att.filePath}:`, err);
            }
          }

          if (m.content) {
            parts.push({ type: "text" as const, text: m.content });
          }

          return {
            role: "user" as const,
            content: parts,
          };
        }

        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      });

    return {
      model: this.google(modelId),
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
