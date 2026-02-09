import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "../lib/utils";
import { Bot, User } from "lucide-react";
import type { Attachment, AttachmentMeta } from "@toshik-babe/shared";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  /** True while the assistant message is still being streamed. */
  isStreaming?: boolean;
  /** Full attachments (with base64 data) for locally-created messages. */
  attachments?: Attachment[];
  /** Lightweight attachment metadata (from history, no data). */
  attachmentMetas?: AttachmentMeta[];
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-3">
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-4 group max-w-3xl mx-auto w-full",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5",
          isUser
            ? "bg-user-bubble text-user-bubble-foreground"
            : "bg-accent text-accent-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-user-bubble text-user-bubble-foreground rounded-br-md"
            : "bg-assistant-bubble text-assistant-bubble-foreground rounded-bl-md",
        )}
      >
        {/* Inline image attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((att) => (
              <img
                key={att.id}
                src={`data:${att.type};base64,${att.data}`}
                alt={att.name}
                className="max-h-48 max-w-full rounded-lg object-contain"
              />
            ))}
          </div>
        )}
        {/* Attachment metadata badges (history, no data) */}
        {!message.attachments?.length &&
          message.attachmentMetas &&
          message.attachmentMetas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {message.attachmentMetas.map((meta) => (
                <span
                  key={meta.id}
                  className="inline-flex items-center gap-1 text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full"
                >
                  {meta.name}
                </span>
              ))}
            </div>
          )}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-code:text-foreground">
            {message.content ? (
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
            ) : message.isStreaming ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="text-sm">Thinking</span>
                <StreamingDots />
              </span>
            ) : null}
            {message.isStreaming && message.content && (
              <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-cursor ml-0.5 align-text-bottom rounded-sm" />
            )}
          </div>
        )}
        <div
          className={cn(
            "mt-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "text-user-bubble-foreground/50" : "text-muted-foreground/60",
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
