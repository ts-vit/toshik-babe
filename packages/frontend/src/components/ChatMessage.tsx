import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "../lib/utils";
import { Bot, User } from "lucide-react";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  /** True while the assistant message is still being streamed. */
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3 px-4 py-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-code:text-foreground">
            {message.content ? (
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{message.content}</ReactMarkdown>
            ) : message.isStreaming ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="animate-pulse">Thinking</span>
                <StreamingDots />
              </span>
            ) : null}
            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
            )}
          </div>
        )}
        <div
          className={cn(
            "mt-1 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/** Animated dots shown while waiting for the first token. */
function StreamingDots(): React.JSX.Element {
  return (
    <span className="inline-flex gap-0.5">
      <span
        className="w-1 h-1 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1 h-1 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1 h-1 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
