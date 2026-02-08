import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@toshik-babe/shared";

export type ConnectionState = "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  /** WebSocket endpoint URL (e.g. ws://localhost:3001/ws). When undefined, hook stays idle. */
  url?: string;
  /** Auto-reconnect on close (default: true). */
  autoReconnect?: boolean;
  /** Delay between reconnect attempts in ms (default: 2000). */
  reconnectDelay?: number;
  /** Max reconnect attempts before giving up (default: 10). */
  maxRetries?: number;
}

interface UseWebSocketReturn {
  /** Current connection state. */
  state: ConnectionState;
  /** Last message received from the server. */
  lastMessage: ServerMessage | null;
  /** Send a typed client message. */
  send: (msg: ClientMessage) => void;
  /** Manually reconnect. */
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { url, autoReconnect = true, reconnectDelay = 2000, maxRetries = 10 } = options;

  const [state, setState] = useState<ConnectionState>(url ? "connecting" : "closed");
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url) return;
    cleanup();
    if (unmountedRef.current) return;

    setState("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      retriesRef.current = 0;
      setState("open");
    };

    ws.onmessage = (event: MessageEvent) => {
      if (unmountedRef.current) return;
      try {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        setLastMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (unmountedRef.current) return;
      setState("error");
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setState("closed");

      if (autoReconnect && retriesRef.current < maxRetries) {
        retriesRef.current += 1;
        const delay = reconnectDelay * Math.min(retriesRef.current, 5);
        timerRef.current = setTimeout(connect, delay);
      }
    };
  }, [url, autoReconnect, reconnectDelay, maxRetries, cleanup]);

  useEffect(() => {
    if (!url) {
      cleanup();
      setState("closed");
      return;
    }
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  }, [url, connect, cleanup]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  return { state, lastMessage, send, reconnect };
}
