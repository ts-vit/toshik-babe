import { test, expect, describe, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks — mock all provider dependencies so we never hit real APIs.
// ---------------------------------------------------------------------------

mock.module("ai", () => ({
  generateText: mock(() => Promise.resolve({ text: "ok", usage: null })),
  streamText: mock(() => ({ textStream: (async function* () {})() })),
}));

mock.module("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mock(() => mock((_id: string) => `google:${_id}`)),
}));

mock.module("@ai-sdk/openai", () => ({
  createOpenAI: mock(() => ({ chat: mock((_id: string) => `openai:${_id}`) })),
}));

mock.module("@ai-sdk/anthropic", () => ({
  createAnthropic: mock(() => mock((_id: string) => `anthropic:${_id}`)),
}));

mock.module("ollama-ai-provider", () => ({
  createOllama: mock(() => mock((_id: string) => `ollama:${_id}`)),
}));

const { ModelProviderFactory } = await import("./factory");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ModelProviderFactory", () => {
  test("supportedIds returns all four providers", () => {
    const ids = ModelProviderFactory.supportedIds();
    expect(ids).toContain("gemini");
    expect(ids).toContain("gigachat");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("ollama");
    expect(ids).toHaveLength(4);
  });

  test("create('gemini') returns GeminiProvider", () => {
    const provider = ModelProviderFactory.create("gemini", { apiKey: "test-key" });
    expect(provider.id).toBe("gemini");
  });

  test("create('gigachat') returns GigaChatProvider", () => {
    const provider = ModelProviderFactory.create("gigachat", { apiKey: "test-key" });
    expect(provider.id).toBe("gigachat");
  });

  test("create('anthropic') returns AnthropicProvider", () => {
    const provider = ModelProviderFactory.create("anthropic", { apiKey: "test-key" });
    expect(provider.id).toBe("anthropic");
  });

  test("create('ollama') returns OllamaProvider", () => {
    const provider = ModelProviderFactory.create("ollama");
    expect(provider.id).toBe("ollama");
  });

  test("create with custom defaultModel passes it to provider", () => {
    const provider = ModelProviderFactory.create("anthropic", {
      apiKey: "test-key",
      defaultModel: "claude-3-haiku-20240307",
    });
    expect(provider.id).toBe("anthropic");
  });

  test("create throws for unknown provider id", () => {
    expect(() =>
      ModelProviderFactory.create("unknown" as any),
    ).toThrow('unknown provider "unknown"');
  });
});
