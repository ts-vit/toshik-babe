import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { ChatMessage, ChatOptions } from "./types";

// ---------------------------------------------------------------------------
// Mocks — we mock `ai` and `@ai-sdk/anthropic` so we never hit the real API.
// ---------------------------------------------------------------------------

const mockGenerateText = mock(() =>
  Promise.resolve({
    text: "Hello from Anthropic!",
    usage: {
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    },
  }),
);

async function* fakeTextStream() {
  yield "Hello";
  yield " from";
  yield " Claude";
}

const mockStreamText = mock(() => ({
  textStream: fakeTextStream(),
}));

const mockAnthropicModel = mock((_modelId: string) => `mock-model:${_modelId}`);

const mockCreateAnthropic = mock((_opts: { apiKey: string }) => mockAnthropicModel);

mock.module("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

mock.module("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

// Import *after* the mock is set up so the provider picks up the mock.
const { AnthropicProvider } = await import("./anthropic.provider");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnthropicProvider", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockStreamText.mockClear();
    mockAnthropicModel.mockClear();
    mockCreateAnthropic.mockClear();

    // Reset mockStreamText to produce a fresh async generator each call.
    mockStreamText.mockImplementation(() => ({
      textStream: fakeTextStream(),
    }));
  });

  test("constructor throws without API key", () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      expect(() => new AnthropicProvider()).toThrow("API key is required");
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });

  test("constructor accepts explicit API key", () => {
    const provider = new AnthropicProvider("test-key");
    expect(provider.id).toBe("anthropic");
  });

  test("constructor reads API key from env", () => {
    process.env["ANTHROPIC_API_KEY"] = "env-key";
    try {
      const provider = new AnthropicProvider();
      expect(provider.id).toBe("anthropic");
    } finally {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });

  test("createAnthropic is called with apiKey", () => {
    new AnthropicProvider("test-key");
    expect(mockCreateAnthropic).toHaveBeenCalledTimes(1);
    const opts = mockCreateAnthropic.mock.calls[0]![0];
    expect(opts).toMatchObject({ apiKey: "test-key" });
  });

  describe("chat()", () => {
    test("returns text and usage metadata", async () => {
      const provider = new AnthropicProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const result = await provider.chat(messages);

      expect(result.text).toBe("Hello from Anthropic!");
      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
      });
    });

    test("passes system prompt via system parameter", async () => {
      const provider = new AnthropicProvider("test-key");
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
      ];

      await provider.chat(messages);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "You are a helpful assistant.");
      // System messages must be filtered from the messages array.
      const msgs = firstArg["messages"] as Array<{ role: string }>;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.role).toBe("user");
    });

    test("passes ChatOptions to generateText", async () => {
      const provider = new AnthropicProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      const options: ChatOptions = {
        model: "claude-3-haiku-20240307",
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: "Be concise.",
      };

      await provider.chat(messages, options);

      expect(mockAnthropicModel).toHaveBeenCalledWith("claude-3-haiku-20240307");

      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "Be concise.");
      expect(firstArg).toHaveProperty("temperature", 0.7);
      expect(firstArg).toHaveProperty("maxTokens", 2048);
    });

    test("filters system messages from messages array", async () => {
      const provider = new AnthropicProvider("test-key");
      const messages: ChatMessage[] = [
        { role: "system", content: "sys" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hey" },
      ];

      await provider.chat(messages);

      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      const msgs = firstArg["messages"] as Array<{ role: string; content: string }>;
      expect(msgs).toHaveLength(2);
      expect(msgs[0]?.role).toBe("user");
      expect(msgs[1]?.role).toBe("assistant");
    });
  });

  describe("stream()", () => {
    test("yields text chunks and a final done=true chunk", async () => {
      const provider = new AnthropicProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // 3 text chunks + 1 sentinel
      expect(chunks.length).toBe(4);
      expect(chunks[0]).toEqual({ text: "Hello", done: false });
      expect(chunks[1]).toEqual({ text: " from", done: false });
      expect(chunks[2]).toEqual({ text: " Claude", done: false });
      expect(chunks[3]).toEqual({ text: "", done: true });
    });
  });
});
