/**
 * Stronghold-based secret storage for API keys.
 *
 * Uses Tauri Stronghold plugin to encrypt secrets at rest.
 * Falls back to a no-op in non-Tauri environments (browser dev mode).
 */

import type { ProviderConfigId } from "@toshik-babe/shared";

/** Detect if we're running inside Tauri. */
const IS_TAURI =
  typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined";

/** Stronghold file name (stored in app data dir). */
const STRONGHOLD_FILE = "secrets.hold";
/** Password for the stronghold vault (derived via argon2 on the Rust side). */
const STRONGHOLD_PASSWORD = "toshik-babe-secrets";
/** Client name inside the stronghold. */
const CLIENT_NAME = "toshik-babe";

/** Build the store key for a provider's API key. */
function storeKey(provider: ProviderConfigId): string {
  return `apikey:${provider}`;
}

/** Convert a string to a number[] for Stronghold insert. */
function stringToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

/** Convert a Uint8Array from Stronghold get to a string. */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Save an API key for the given provider into Stronghold.
 * No-op if not running in Tauri.
 */
export async function saveSecret(provider: ProviderConfigId, apiKey: string): Promise<void> {
  if (!IS_TAURI) {
    console.warn("[stronghold] Not in Tauri environment, skipping saveSecret");
    return;
  }

  const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
  const { appDataDir } = await import("@tauri-apps/api/path");

  const dataDir = await appDataDir();
  const path = `${dataDir}${STRONGHOLD_FILE}`;

  const stronghold = await Stronghold.load(path, STRONGHOLD_PASSWORD);

  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    client = await stronghold.createClient(CLIENT_NAME);
  }

  const store = client.getStore();
  await store.insert(storeKey(provider), stringToBytes(apiKey));
  await stronghold.save();
}

/**
 * Retrieve an API key for the given provider from Stronghold.
 * Returns null if not found or not in Tauri.
 */
export async function getSecret(provider: ProviderConfigId): Promise<string | null> {
  if (!IS_TAURI) {
    console.warn("[stronghold] Not in Tauri environment, skipping getSecret");
    return null;
  }

  const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
  const { appDataDir } = await import("@tauri-apps/api/path");

  const dataDir = await appDataDir();
  const path = `${dataDir}${STRONGHOLD_FILE}`;

  let stronghold;
  try {
    stronghold = await Stronghold.load(path, STRONGHOLD_PASSWORD);
  } catch {
    // Stronghold file doesn't exist yet — no secrets saved.
    return null;
  }

  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    return null;
  }

  const store = client.getStore();
  const data = await store.get(storeKey(provider));
  if (!data || data.length === 0) return null;

  return bytesToString(data);
}

/**
 * Remove an API key for the given provider from Stronghold.
 * No-op if not in Tauri.
 */
export async function removeSecret(provider: ProviderConfigId): Promise<void> {
  if (!IS_TAURI) return;

  const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
  const { appDataDir } = await import("@tauri-apps/api/path");

  const dataDir = await appDataDir();
  const path = `${dataDir}${STRONGHOLD_FILE}`;

  let stronghold;
  try {
    stronghold = await Stronghold.load(path, STRONGHOLD_PASSWORD);
  } catch {
    return;
  }

  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    return;
  }

  const store = client.getStore();
  await store.remove(storeKey(provider));
  await stronghold.save();
}
