/**
 * Unified model provider interface for LLM integrations.
 *
 * Every provider (Gemini, Anthropic, Ollama, etc.) must implement this
 * interface so the rest of the backend stays provider-agnostic.
 */

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Options passed to chat / stream calls. */
export interface ChatOptions {
  /** Model identifier, e.g. "gemini-2.0-flash". */
  model?: string;
  /** Sampling temperature (0-2). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** System-level instruction prepended to the conversation. */
  systemPrompt?: string;
}

/** Non-streaming response returned by `chat()`. */
export interface ChatResponse {
  /** The generated text. */
  text: string;
  /** Token usage metadata (when available). */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** A single chunk emitted during streaming. */
export interface StreamChunk {
  /** Partial text delta. */
  text: string;
  /** `true` when this is the final chunk. */
  done: boolean;
}

/**
 * Provider-agnostic interface that every LLM adapter must implement.
 */
export interface ModelProvider {
  /** Unique provider id, e.g. "gemini", "anthropic". */
  readonly id: string;

  /**
   * Send a conversation and get a complete response.
   * Use for non-streaming use-cases (summaries, embeddings prep, etc.).
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Send a conversation and receive an async iterable of text chunks.
   * Use for real-time token streaming to the UI.
   */
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamChunk>;
}
