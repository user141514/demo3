import { useEffect, useRef, useCallback } from "react";
import type { WSMessage } from "@/types";

interface UseWebSocketOptions {
  workshopId: number | null;
  channel?: string;
  onMessage: (msg: WSMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({ workshopId, channel = "all", onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (!workshopId || !enabled) return;
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`ws://localhost:8000/ws/${workshopId}?channel=${channel}`);
    wsRef.current = ws;

    ws.onopen = () => console.log(`WS connected: workshop=${workshopId}, channel=${channel}`);
    ws.onmessage = (event) => {
      try { onMessageRef.current(JSON.parse(event.data)); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (enabled && workshopId) {
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };
  }, [workshopId, enabled, channel]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
