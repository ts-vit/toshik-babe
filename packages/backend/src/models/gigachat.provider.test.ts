import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { ChatMessage, ChatOptions } from "./types";

// ---------------------------------------------------------------------------
// Mocks — we mock `ai` and `@ai-sdk/openai` so we never hit the real API.
// ---------------------------------------------------------------------------

const mockGenerateText = mock(() =>
  Promise.resolve({
    text: "Hello from GigaChat!",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  }),
);

async function* fakeTextStream() {
  yield "Привет";
  yield " мир";
}

const mockStreamText = mock(() => ({
  textStream: fakeTextStream(),
}));

const mockOpenAIModel = mock((_modelId: string) => `mock-model:${_modelId}`);

const mockCreateOpenAI = mock((_opts: { apiKey: string; baseURL: string }) => mockOpenAIModel);

mock.module("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

mock.module("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

// Import *after* the mock is set up so the provider picks up the mock.
const { GigaChatProvider } = await import("./gigachat.provider");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GigaChatProvider", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockStreamText.mockClear();
    mockOpenAIModel.mockClear();
    mockCreateOpenAI.mockClear();

    // Reset mockStreamText to produce a fresh async generator each call.
    mockStreamText.mockImplementation(() => ({
      textStream: fakeTextStream(),
    }));
  });

  test("constructor throws without API key", () => {
    const saved = process.env["GIGACHAT_API_KEY"];
    delete process.env["GIGACHAT_API_KEY"];
    try {
      expect(() => new GigaChatProvider()).toThrow("API key is required");
    } finally {
      if (saved !== undefined) process.env["GIGACHAT_API_KEY"] = saved;
    }
  });

  test("constructor accepts explicit API key", () => {
    const provider = new GigaChatProvider("test-key");
    expect(provider.id).toBe("gigachat");
  });

  test("constructor reads API key from env", () => {
    process.env["GIGACHAT_API_KEY"] = "env-key";
    try {
      const provider = new GigaChatProvider();
      expect(provider.id).toBe("gigachat");
    } finally {
      delete process.env["GIGACHAT_API_KEY"];
    }
  });

  test("createOpenAI is called with correct baseURL", () => {
    new GigaChatProvider("test-key");
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://gigachat.devices.sberbank.ru/api/v1",
    });
  });

  describe("chat()", () => {
    test("returns text and usage metadata", async () => {
      const provider = new GigaChatProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Привет" }];

      const result = await provider.chat(messages);

      expect(result.text).toBe("Hello from GigaChat!");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    test("uses GigaChat:latest as default model", async () => {
      const provider = new GigaChatProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      await provider.chat(messages);

      expect(mockOpenAIModel).toHaveBeenCalledWith("GigaChat:latest");
    });

    test("passes system prompt via system parameter", async () => {
      const provider = new GigaChatProvider("test-key");
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
      const provider = new GigaChatProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      const options: ChatOptions = {
        model: "GigaChat-Pro",
        temperature: 0.5,
        maxTokens: 1024,
        systemPrompt: "Be brief.",
      };

      await provider.chat(messages, options);

      expect(mockOpenAIModel).toHaveBeenCalledWith("GigaChat-Pro");

      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "Be brief.");
      expect(firstArg).toHaveProperty("temperature", 0.5);
      expect(firstArg).toHaveProperty("maxTokens", 1024);
    });
  });

  describe("stream()", () => {
    test("yields text chunks and a final done=true chunk", async () => {
      const provider = new GigaChatProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // 2 text chunks + 1 sentinel
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toEqual({ text: "Привет", done: false });
      expect(chunks[1]).toEqual({ text: " мир", done: false });
      expect(chunks[2]).toEqual({ text: "", done: true });
    });
  });
});
