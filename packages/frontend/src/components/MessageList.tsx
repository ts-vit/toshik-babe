import React, { useEffect, useRef } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { MessageSquare } from "lucide-react";

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
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
            <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-muted-foreground text-base font-medium">No messages yet</p>
            <p className="text-muted-foreground/50 text-sm mt-1">
              Send a message to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="py-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
