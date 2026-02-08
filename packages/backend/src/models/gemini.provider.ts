import {
  GoogleGenerativeAI,
  type Content,
  type GenerativeModel,
  type GenerationConfig,
} from "@google/generative-ai";

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelProvider,
  StreamChunk,
} from "./types";

const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * Map our generic role names to the Gemini SDK role strings.
 * Gemini only accepts "user" | "model"; system instructions
 * are handled separately via `systemInstruction`.
 */
function toGeminiRole(role: ChatMessage["role"]): "user" | "model" {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "model";
    case "system":
      // System messages are filtered out and set via systemInstruction.
      // This fallback should never be reached.
      return "user";
  }
}

/**
 * Convert our ChatMessage[] to Gemini Content[], stripping system messages.
 */
function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }));
}

/**
 * Extract system prompt from options or from system-role messages.
 */
function resolveSystemPrompt(
  messages: ChatMessage[],
  options?: ChatOptions,
): string | undefined {
  if (options?.systemPrompt) return options.systemPrompt;
  const systemMsg = messages.find((m) => m.role === "system");
  return systemMsg?.content;
}

/**
 * Build Gemini GenerationConfig from our ChatOptions.
 */
function toGenerationConfig(options?: ChatOptions): GenerationConfig {
  const config: GenerationConfig = {};
  if (options?.temperature !== undefined) config.temperature = options.temperature;
  if (options?.maxTokens !== undefined) config.maxOutputTokens = options.maxTokens;
  return config;
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini" as const;

  private readonly client: GoogleGenerativeAI;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    const key = apiKey ?? process.env["GOOGLE_GENAI_API_KEY"];
    if (!key) {
      throw new Error(
        "GeminiProvider: API key is required. " +
          "Set GOOGLE_GENAI_API_KEY env variable or pass apiKey to constructor.",
      );
    }
    this.client = new GoogleGenerativeAI(key);
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  /** Get a GenerativeModel instance configured for the request. */
  private getModel(messages: ChatMessage[], options?: ChatOptions): GenerativeModel {
    const modelName = options?.model ?? this.defaultModel;
    const systemPrompt = resolveSystemPrompt(messages, options);

    return this.client.getGenerativeModel({
      model: modelName,
      generationConfig: toGenerationConfig(options),
      ...(systemPrompt
        ? { systemInstruction: { role: "user", parts: [{ text: systemPrompt }] } }
        : {}),
    });
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = this.getModel(messages, options);
    const contents = toGeminiContents(messages);

    const result = await model.generateContent({
      contents,
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      text,
      usage: usage
        ? {
            promptTokens: usage.promptTokenCount,
            completionTokens: usage.candidatesTokenCount,
            totalTokens: usage.totalTokenCount,
          }
        : undefined,
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<StreamChunk> {
    const model = this.getModel(messages, options);
    const contents = toGeminiContents(messages);

    const { stream } = await model.generateContentStream({
      contents,
    });

    for await (const chunk of stream) {
      const text = chunk.text();
      yield { text, done: false };
    }

    // Final sentinel chunk
    yield { text: "", done: true };
  }
}
