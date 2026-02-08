import type { ModelProvider } from "./types";
import { GeminiProvider } from "./gemini.provider";
import { GigaChatProvider } from "./gigachat.provider";
import { AnthropicProvider } from "./anthropic.provider";
import { OllamaProvider } from "./ollama.provider";

/** Supported provider identifiers. */
export type ProviderId = "gemini" | "gigachat" | "anthropic" | "ollama";

/** Options for creating a model provider. */
export interface ProviderOptions {
  /** API key (used by gemini, gigachat, anthropic). Ignored by ollama. */
  apiKey?: string;
  /** Default model identifier for the provider. */
  defaultModel?: string;
  /** Base URL (used by ollama). */
  baseURL?: string;
}

/**
 * Factory for creating model providers by id.
 *
 * Usage:
 * ```ts
 * const provider = ModelProviderFactory.create("anthropic", { apiKey: "sk-..." });
 * const response = await provider.chat([{ role: "user", content: "Hi" }]);
 * ```
 */
export class ModelProviderFactory {
  private static readonly builders: Record<
    ProviderId,
    (options?: ProviderOptions) => ModelProvider
  > = {
    gemini: (opts) => new GeminiProvider(opts?.apiKey, opts?.defaultModel),
    gigachat: (opts) => new GigaChatProvider(opts?.apiKey, opts?.defaultModel),
    anthropic: (opts) => new AnthropicProvider(opts?.apiKey, opts?.defaultModel),
    ollama: (opts) => new OllamaProvider(opts?.baseURL, opts?.defaultModel),
  };

  /**
   * Create a ModelProvider by its identifier.
   *
   * @throws Error if the provider id is unknown.
   */
  static create(id: ProviderId, options?: ProviderOptions): ModelProvider {
    const builder = ModelProviderFactory.builders[id];
    if (!builder) {
      throw new Error(
        `ModelProviderFactory: unknown provider "${id}". ` +
          `Supported: ${ModelProviderFactory.supportedIds().join(", ")}`,
      );
    }
    return builder(options);
  }

  /** List all supported provider identifiers. */
  static supportedIds(): ProviderId[] {
    return Object.keys(ModelProviderFactory.builders) as ProviderId[];
  }
}
