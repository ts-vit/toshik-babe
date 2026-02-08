import React, { useEffect, useRef } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";

interface MessageListProps {
  messages: ChatMessageData[];
}

export function MessageList({ messages }: MessageListProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-lg">No messages yet</p>
          <p className="text-muted-foreground/60 text-sm">Send a message to get started</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="py-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
