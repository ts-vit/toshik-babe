import React from "react";
import type { ChatListItem } from "@toshik-babe/shared";
import { Plus, Settings, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

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
    <aside className="flex flex-col h-screen w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar-bg">
      {/* New Chat button */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm truncate transition-colors",
                    conv.id === activeId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span className="truncate">{conv.title || "Untitled"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Settings button */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          type="button"
          onClick={onSettingsOpen}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
