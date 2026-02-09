import React from "react";
import type { ChatListItem } from "@toshik-babe/shared";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";

interface SidebarProps {
  /** List of conversations to display. */
  conversations: ChatListItem[];
  /** Currently active conversation ID (if any). */
  activeId: string | null;
  /** Called when user clicks on a conversation. */
  onSelect: (id: string) => void;
  /** Called when user clicks "New Chat". */
  onNewChat: () => void;
  /** Called when user clicks the settings (gear) button. */
  onSettingsOpen: () => void;
  /** True while the conversation list is loading. */
  loading?: boolean;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onSettingsOpen,
  loading = false,
}: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex flex-col h-full w-64 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground">
      {/* New Chat button */}
      <div className="p-3 border-b border-sidebar-border">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <PlusIcon />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No conversations yet</p>
        ) : (
          <ul className="flex flex-col gap-0.5 p-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm truncate transition-colors ${
                    conv.id === activeId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                  }`}
                >
                  {conv.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Settings button */}
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onSettingsOpen}
        >
          <GearIcon />
          Settings
        </Button>
      </div>
    </aside>
  );
}

/** Simple gear icon (16×16). */
function GearIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Simple "+" icon (16×16). */
function PlusIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
