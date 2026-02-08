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
  /** True while the conversation list is loading. */
  loading?: boolean;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
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
    </aside>
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
