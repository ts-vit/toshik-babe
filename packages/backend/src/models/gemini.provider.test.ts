import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { ChatMessage, ChatOptions } from "./types";

// ---------------------------------------------------------------------------
// Mocks — we mock the entire @google/generative-ai module so we never
// hit the real API.  The mock mirrors the SDK's shape just enough for
// our provider code.
// ---------------------------------------------------------------------------

const mockGenerateContent = mock(() =>
  Promise.resolve({
    response: {
      text: () => "Hello from Gemini!",
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    },
  }),
);

async function* fakeStream() {
  yield { text: () => "Hello" };
  yield { text: () => " world" };
}

const mockGenerateContentStream = mock(() =>
  Promise.resolve({
    stream: fakeStream(),
    response: Promise.resolve({ text: () => "Hello world" }),
  }),
);

const mockGetGenerativeModel = mock(() => ({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
}));

mock.module("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(_apiKey: string) {}
    getGenerativeModel = mockGetGenerativeModel;
  },
}));

// Import *after* the mock is set up so the provider picks up the mock.
const { GeminiProvider } = await import("./gemini.provider");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GeminiProvider", () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
    mockGenerateContentStream.mockClear();
    mockGetGenerativeModel.mockClear();
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
      const messages: ChatMessage[] = [
        { role: "user", content: "Hi" },
      ];

      const result = await provider.chat(messages);

      expect(result.text).toBe("Hello from Gemini!");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    test("passes system prompt via systemInstruction", async () => {
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
      ];

      await provider.chat(messages);

      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
      const modelParams = mockGetGenerativeModel.mock.calls[0] as unknown as unknown[];
      const firstArg = modelParams[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("systemInstruction");
    });

    test("passes ChatOptions to model", async () => {
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
      const options: ChatOptions = {
        model: "gemini-1.5-pro",
        temperature: 0.5,
        maxTokens: 1024,
        systemPrompt: "Be brief.",
      };

      await provider.chat(messages, options);

      const modelParams = mockGetGenerativeModel.mock.calls[0] as unknown as unknown[];
      const firstArg = modelParams[0] as Record<string, unknown>;
      expect(firstArg).toHaveProperty("model", "gemini-1.5-pro");
      expect(firstArg).toHaveProperty("systemInstruction");

      const genConfig = firstArg["generationConfig"] as Record<string, unknown>;
      expect(genConfig).toHaveProperty("temperature", 0.5);
      expect(genConfig).toHaveProperty("maxOutputTokens", 1024);
    });

    test("filters system messages from contents", async () => {
      const provider = new GeminiProvider("test-key");
      const messages: ChatMessage[] = [
        { role: "system", content: "sys" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hey" },
      ];

      await provider.chat(messages);

      const rawArgs = mockGenerateContent.mock.calls[0] as unknown as unknown[];
      const callArgs = rawArgs[0] as Record<string, unknown>;
      const contents = callArgs["contents"] as Array<{ role: string }>;
      expect(contents).toHaveLength(2);
      expect(contents[0]!.role).toBe("user");
      expect(contents[1]!.role).toBe("model");
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
