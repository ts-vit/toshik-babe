import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { ChatMessage, ChatOptions } from "./types";

// ---------------------------------------------------------------------------
// Mocks — we mock `ai` and `ollama-ai-provider` so we never hit a real Ollama.
// ---------------------------------------------------------------------------

const mockGenerateText = mock(() =>
  Promise.resolve({
    text: "Hello from Ollama!",
    usage: {
      inputTokens: 6,
      outputTokens: 4,
      totalTokens: 10,
    },
  }),
);

async function* fakeTextStream() {
  yield "Llama";
  yield " says";
  yield " hi";
}

const mockStreamText = mock(() => ({
  textStream: fakeTextStream(),
}));

const mockOllamaModel = mock((_modelId: string) => `mock-model:${_modelId}`);

const mockCreateOllama = mock((_opts: { baseURL: string }) => mockOllamaModel);

mock.module("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

mock.module("ollama-ai-provider", () => ({
  createOllama: mockCreateOllama,
}));

// Import *after* the mock is set up so the provider picks up the mock.
const { OllamaProvider } = await import("./ollama.provider");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OllamaProvider", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockStreamText.mockClear();
    mockOllamaModel.mockClear();
    mockCreateOllama.mockClear();

    // Reset mockStreamText to produce a fresh async generator each call.
    mockStreamText.mockImplementation(() => ({
      textStream: fakeTextStream(),
    }));
  });

  test("constructor does not require API key (local provider)", () => {
    const provider = new OllamaProvider();
    expect(provider.id).toBe("ollama");
  });

  test("constructor uses default base URL", () => {
    new OllamaProvider();
    expect(mockCreateOllama).toHaveBeenCalledTimes(1);
    const opts = mockCreateOllama.mock.calls[0]![0];
    expect(opts).toMatchObject({ baseURL: "http://127.0.0.1:11434/api" });
  });

  test("constructor accepts custom base URL", () => {
    new OllamaProvider("http://my-server:11434/api");
    expect(mockCreateOllama).toHaveBeenCalledTimes(1);
    const opts = mockCreateOllama.mock.calls[0]![0];
    expect(opts).toMatchObject({ baseURL: "http://my-server:11434/api" });
  });

  test("constructor reads base URL from env", () => {
    process.env["OLLAMA_BASE_URL"] = "http://env-server:11434/api";
    try {
      new OllamaProvider();
      const opts = mockCreateOllama.mock.calls[0]![0];
      expect(opts).toMatchObject({ baseURL: "http://env-server:11434/api" });
    } finally {
      delete process.env["OLLAMA_BASE_URL"];
    }
  });

  describe("chat()", () => {
    test("returns text and usage metadata", async () => {
      const provider = new OllamaProvider();
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const result = await provider.chat(messages);

      expect(result.text).toBe("Hello from Ollama!");
      expect(result.usage).toEqual({
        promptTokens: 6,
        completionTokens: 4,
        totalTokens: 10,
      });
    });

    test("uses llama3 as default model", async () => {
      const provider = new OllamaProvider();
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      await provider.chat(messages);

      expect(mockOllamaModel).toHaveBeenCalledWith("llama3");
    });

    test("passes system prompt via system parameter", async () => {
      const provider = new OllamaProvider();
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
      ];

      await provider.chat(messages);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "You are a helpful assistant.");
      const msgs = firstArg["messages"] as Array<{ role: string }>;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.role).toBe("user");
    });

    test("passes ChatOptions to generateText", async () => {
      const provider = new OllamaProvider();
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      const options: ChatOptions = {
        model: "mistral",
        temperature: 0.3,
        maxTokens: 512,
        systemPrompt: "Be brief.",
      };

      await provider.chat(messages, options);

      expect(mockOllamaModel).toHaveBeenCalledWith("mistral");

      const callArgs = mockGenerateText.mock.calls[0] as unknown as unknown[];
      const firstArg = callArgs[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("system", "Be brief.");
      expect(firstArg).toHaveProperty("temperature", 0.3);
      expect(firstArg).toHaveProperty("maxTokens", 512);
    });

    test("filters system messages from messages array", async () => {
      const provider = new OllamaProvider();
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
      const provider = new OllamaProvider();
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];

      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.stream(messages)) {
        chunks.push(chunk);
      }

      // 3 text chunks + 1 sentinel
      expect(chunks.length).toBe(4);
      expect(chunks[0]).toEqual({ text: "Llama", done: false });
      expect(chunks[1]).toEqual({ text: " says", done: false });
      expect(chunks[2]).toEqual({ text: " hi", done: false });
      expect(chunks[3]).toEqual({ text: "", done: true });
    });
  });
});
