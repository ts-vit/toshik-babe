import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { ChatMessage, ChatOptions } from "./types";

// ---------------------------------------------------------------------------
// Mocks — we mock `ai` and `@ai-sdk/google` so we never hit the real API.
// ---------------------------------------------------------------------------

const mockGenerateText = mock(() =>
  Promise.resolve({
    text: "Hello from Gemini!",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  }),
);

async function* fakeTextStream() {
  yield "Hello";
  yield " world";
}

const mockStreamText = mock(() => ({
  textStream: fakeTextStream(),
}));

const mockGoogleModel = mock((_modelId: string) => `mock-model:${_modelId}`);

const mockCreateGoogleGenerativeAI = mock((_opts: { apiKey: string }) => mockGoogleModel);

mock.module("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

mock.module("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mockCreateGoogleGenerativeAI,
}));

// Import *after* the mock is set up so the provider picks up the mock.
const { GeminiProvider } = await import("./gemini.provider");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GeminiProvider", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockStreamText.mockClear();
    mockGoogleModel.mockClear();
    mockCreateGoogleGenerativeAI.mockClear();

    // Reset mockStreamText to produce a fresh async generator each call.
    mockStreamText.mockImplementation(() => ({
      textStream: fakeTextStream(),
    }));
  });

  test("constructor throws without API key", () => {
    const saved = process.env["GOOGLE_GENAI_API_KEY"];
    delete process.env["GOOGLE_GENAI_API_KEY"];
    try {
      expect(() => new GeminiProvider()).toThrow("API key is required");
    } finally {
      if (saved !== undefined) process.env["GOOGLE_GENAI_API_KEY"] = saved;
    }
  });

  test("constructor accepts explicit API key", () => {
    const provider = new GeminiProvider("test-key");
    expect(provider.id).toBe("gemini");
  });

  test("constructor reads API key from env", () => {
    process.env["GOOGLE_GENAI_API_KEY"] = "env-key";
    try {
      const provider = new GeminiProvider();
      expect(provider.id).toBe("gemini");
    } finally {
      delete process.env["GOOGLE_GENAI_API_KEY"];
    }
  });

  describe("chat()", () => {
    test("returns text and usage metadata", async () => {
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const result = await provider.chat(messages);

      expect(result.text).toBe("Hello from Gemini!");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    test("passes system prompt via system parameter", async () => {
      const provider = new GeminiProvider("test-key");
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
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      const options: ChatOptions = {
        model: "gemini-1.5-pro",
        temperature: 0.5,
        maxTokens: 1024,
        systemPrompt: "Be brief.",
      };

      await provider.chat(messages, options);

      expect(mockGoogleModel).toHaveBeenCalledWith("gemini-1.5-pro");

      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "Be brief.");
      expect(firstArg).toHaveProperty("temperature", 0.5);
      expect(firstArg).toHaveProperty("maxTokens", 1024);
    });

    test("filters system messages from messages array", async () => {
      const provider = new GeminiProvider("test-key");
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
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // 2 text chunks + 1 sentinel
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toEqual({ text: "Hello", done: false });
      expect(chunks[1]).toEqual({ text: " world", done: false });
      expect(chunks[2]).toEqual({ text: "", done: true });
    });
  });
});
