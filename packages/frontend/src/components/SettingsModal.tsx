import React, { useCallback, useEffect, useState } from "react";
import type { ClientMessage, ProviderConfigId, ProviderConfigPayload } from "@toshik-babe/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { saveSecret, getSecret } from "../lib/stronghold";

/* ─── Provider metadata ─────────────────────────────────────────── */

interface ProviderMeta {
  id: ProviderConfigId;
  label: string;
  /** Placeholder for the API key input. */
  placeholder: string;
  /** Whether this provider requires an API key (Ollama is local). */
  requiresKey: boolean;
  /** Optional: show a base URL field. */
  hasBaseUrl?: boolean;
  /** Default base URL value. */
  defaultBaseUrl?: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "gigachat",
    label: "GigaChat",
    placeholder: "Enter GigaChat API key...",
    requiresKey: true,
  },
  {
    id: "gemini",
    label: "Gemini",
    placeholder: "Enter Gemini API key...",
    requiresKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "Enter Anthropic API key...",
    requiresKey: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    placeholder: "No API key needed (local)",
    requiresKey: false,
    hasBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
  },
];

/* ─── Types ─────────────────────────────────────────────────────── */

type ProviderKeys = Record<ProviderConfigId, string>;
type ProviderBaseUrls = Partial<Record<ProviderConfigId, string>>;

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** WebSocket send function to push provider.config to the backend. */
  wsSend: (msg: ClientMessage) => void;
}

/* ─── Component ─────────────────────────────────────────────────── */

export function SettingsModal({ open, onOpenChange, wsSend }: SettingsModalProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ProviderConfigId>("gigachat");
  const [activeProvider, setActiveProvider] = useState<ProviderConfigId>("gigachat");
  const [keys, setKeys] = useState<ProviderKeys>({
    gigachat: "",
    gemini: "",
    anthropic: "",
    ollama: "",
  });
  const [baseUrls, setBaseUrls] = useState<ProviderBaseUrls>({
    ollama: "http://localhost:11434",
  });
  const [saving, setSaving] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load stored keys from Stronghold when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingKeys(true);
    setStatusMessage(null);

    const loadAll = async () => {
      const loaded: Partial<ProviderKeys> = {};
      for (const p of PROVIDERS) {
        try {
          const key = await getSecret(p.id);
          if (key && !cancelled) {
            loaded[p.id] = key;
          }
        } catch {
          // Ignore individual load failures.
        }
      }
      if (!cancelled) {
        setKeys((prev) => ({ ...prev, ...loaded }));
        setLoadingKeys(false);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleKeyChange = useCallback((provider: ProviderConfigId, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  }, []);

  const handleBaseUrlChange = useCallback((provider: ProviderConfigId, value: string) => {
    setBaseUrls((prev) => ({ ...prev, [provider]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);

    try {
      // 1. Save all non-empty keys to Stronghold.
      for (const p of PROVIDERS) {
        const key = keys[p.id]?.trim();
        if (key) {
          await saveSecret(p.id, key);
        }
      }

      // 2. Send provider.config to the backend via WebSocket.
      const selectedProvider = PROVIDERS.find((p) => p.id === activeProvider);
      const apiKey = keys[activeProvider]?.trim() || "";

      // For Ollama, API key can be empty — we send "ollama" as a placeholder.
      const effectiveKey = selectedProvider?.requiresKey ? apiKey : apiKey || "ollama";

      if (selectedProvider?.requiresKey && !effectiveKey) {
        setStatusMessage("API key is required for the selected provider.");
        setSaving(false);
        return;
      }

      const payload: ProviderConfigPayload = {
        provider: activeProvider,
        apiKey: effectiveKey,
        ...(baseUrls[activeProvider] ? { baseURL: baseUrls[activeProvider] } : {}),
      };

      const msg: ClientMessage = {
        type: "provider.config",
        payload,
        timestamp: new Date().toISOString(),
      };
      wsSend(msg);

      setStatusMessage("Settings saved successfully.");
      // Close after a brief delay to show the success message.
      setTimeout(() => {
        onOpenChange(false);
        setStatusMessage(null);
      }, 800);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Failed to save: ${errMsg}`);
    } finally {
      setSaving(false);
    }
  }, [keys, baseUrls, activeProvider, wsSend, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage AI provider API keys and select the active provider.</DialogDescription>
        </DialogHeader>

        {/* Active Provider Selector */}
        <div className="space-y-2">
          <Label htmlFor="active-provider">Active Provider</Label>
          <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as ProviderConfigId)}>
            <SelectTrigger id="active-provider">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Provider Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProviderConfigId)}>
          <TabsList className="w-full grid grid-cols-4">
            {PROVIDERS.map((p) => (
              <TabsTrigger key={p.id} value={p.id}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDERS.map((p) => (
            <TabsContent key={p.id} value={p.id} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor={`key-${p.id}`}>API Key</Label>
                <Input
                  id={`key-${p.id}`}
                  type="password"
                  placeholder={p.placeholder}
                  value={keys[p.id]}
                  onChange={(e) => handleKeyChange(p.id, e.target.value)}
                  disabled={loadingKeys || !p.requiresKey}
                  autoComplete="off"
                />
                {!p.requiresKey && (
                  <p className="text-xs text-muted-foreground">
                    This provider runs locally and does not require an API key.
                  </p>
                )}
              </div>

              {p.hasBaseUrl && (
                <div className="space-y-2">
                  <Label htmlFor={`url-${p.id}`}>Base URL</Label>
                  <Input
                    id={`url-${p.id}`}
                    type="url"
                    placeholder={p.defaultBaseUrl || "http://localhost:11434"}
                    value={baseUrls[p.id] ?? p.defaultBaseUrl ?? ""}
                    onChange={(e) => handleBaseUrlChange(p.id, e.target.value)}
                    disabled={loadingKeys}
                  />
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Status message */}
        {statusMessage && (
          <p
            className={`text-sm ${statusMessage.startsWith("Failed") ? "text-destructive" : "text-green-500"}`}
          >
            {statusMessage}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingKeys}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
