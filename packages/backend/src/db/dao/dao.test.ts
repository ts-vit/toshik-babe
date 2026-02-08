import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { openDatabase, type Database } from "../database";
import { ConversationsDao } from "./conversations.dao";
import { MessagesDao } from "./messages.dao";

let db: Database;
let conversationsDao: ConversationsDao;
let messagesDao: MessagesDao;

beforeEach(() => {
  db = openDatabase(":memory:");
  conversationsDao = new ConversationsDao(db);
  messagesDao = new MessagesDao(db);
});

afterEach(() => {
  db.close();
});

// ── Conversations ────────────────────────────────────────────────────

describe("ConversationsDao", () => {
  test("create returns a conversation with generated id", () => {
    const conv = conversationsDao.create({ title: "Test Chat" });

    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe("Test Chat");
    expect(conv.created_at).toBeTruthy();
    expect(conv.updated_at).toBeTruthy();
  });

  test("create with explicit id", () => {
    const conv = conversationsDao.create({
      id: "my-custom-id",
      title: "Custom",
    });

    expect(conv.id).toBe("my-custom-id");
  });

  test("getById returns the correct conversation", () => {
    const created = conversationsDao.create({ title: "Lookup Test" });
    const found = conversationsDao.getById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe("Lookup Test");
  });

  test("getById returns null for non-existent id", () => {
    const found = conversationsDao.getById("does-not-exist");
    expect(found).toBeNull();
  });

  test("list returns conversations ordered by updated_at DESC", () => {
    const c1 = conversationsDao.create({ title: "First" });
    conversationsDao.create({ title: "Second" });
    conversationsDao.create({ title: "Third" });

    // Update the first conversation so it has the latest updated_at.
    conversationsDao.update(c1.id, "First (updated)");

    const all = conversationsDao.list();
    expect(all.length).toBe(3);
    // The updated conversation should come first.
    expect(all[0]!.title).toBe("First (updated)");
  });

  test("list respects limit and offset", () => {
    for (let i = 0; i < 10; i++) {
      conversationsDao.create({ title: `Conv ${i}` });
    }

    const page = conversationsDao.list(3, 2);
    expect(page.length).toBe(3);
  });

  test("update changes title and bumps updated_at", () => {
    const created = conversationsDao.create({ title: "Original" });
    const updated = conversationsDao.update(created.id, "Renamed");

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Renamed");
    expect(updated!.updated_at >= created.updated_at).toBe(true);
  });

  test("update returns null for non-existent id", () => {
    const result = conversationsDao.update("ghost", "Nope");
    expect(result).toBeNull();
  });

  test("delete removes the conversation", () => {
    const created = conversationsDao.create({ title: "To Delete" });
    const deleted = conversationsDao.delete(created.id);

    expect(deleted).toBe(true);
    expect(conversationsDao.getById(created.id)).toBeNull();
  });

  test("delete returns false for non-existent id", () => {
    expect(conversationsDao.delete("nope")).toBe(false);
  });
});

// ── Messages ─────────────────────────────────────────────────────────

describe("MessagesDao", () => {
  let conversationId: string;

  beforeEach(() => {
    const conv = conversationsDao.create({ title: "Msg Test" });
    conversationId = conv.id;
  });

  test("create returns a message with generated id", () => {
    const msg = messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Hello!",
      tokens: 5,
    });

    expect(msg.id).toBeTruthy();
    expect(msg.conversation_id).toBe(conversationId);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello!");
    expect(msg.tokens).toBe(5);
    expect(msg.timestamp).toBeTruthy();
  });

  test("create with explicit id and null tokens", () => {
    const msg = messagesDao.create({
      id: "msg-1",
      conversation_id: conversationId,
      role: "assistant",
      content: "Hi there",
    });

    expect(msg.id).toBe("msg-1");
    expect(msg.tokens).toBeNull();
  });

  test("getById returns the correct message", () => {
    const created = messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Lookup me",
    });

    const found = messagesDao.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.content).toBe("Lookup me");
  });

  test("getById returns null for non-existent id", () => {
    expect(messagesDao.getById("nope")).toBeNull();
  });

  test("listByConversation returns messages in timestamp order", () => {
    messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "First",
    });
    messagesDao.create({
      conversation_id: conversationId,
      role: "assistant",
      content: "Second",
    });
    messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Third",
    });

    const msgs = messagesDao.listByConversation(conversationId);
    expect(msgs.length).toBe(3);
    expect(msgs[0]!.content).toBe("First");
    expect(msgs[2]!.content).toBe("Third");
  });

  test("listByConversation respects limit and offset", () => {
    for (let i = 0; i < 10; i++) {
      messagesDao.create({
        conversation_id: conversationId,
        role: "user",
        content: `Msg ${i}`,
      });
    }

    const page = messagesDao.listByConversation(conversationId, 3, 2);
    expect(page.length).toBe(3);
  });

  test("delete removes a single message", () => {
    const msg = messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Delete me",
    });

    expect(messagesDao.delete(msg.id)).toBe(true);
    expect(messagesDao.getById(msg.id)).toBeNull();
  });

  test("delete returns false for non-existent id", () => {
    expect(messagesDao.delete("ghost")).toBe(false);
  });

  test("deleteByConversation removes all messages for a conversation", () => {
    messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "One",
    });
    messagesDao.create({
      conversation_id: conversationId,
      role: "assistant",
      content: "Two",
    });

    const count = messagesDao.deleteByConversation(conversationId);
    expect(count).toBe(2);
    expect(messagesDao.listByConversation(conversationId).length).toBe(0);
  });

  test("creating a message bumps conversation updated_at", () => {
    const before = conversationsDao.getById(conversationId)!;

    // Small delay to ensure different timestamp.
    messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Bump",
    });

    const after = conversationsDao.getById(conversationId)!;
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  test("cascade delete: deleting conversation removes its messages", () => {
    messagesDao.create({
      conversation_id: conversationId,
      role: "user",
      content: "Will be cascaded",
    });

    conversationsDao.delete(conversationId);
    const msgs = messagesDao.listByConversation(conversationId);
    expect(msgs.length).toBe(0);
  });
});
