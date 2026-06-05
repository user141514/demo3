import { useEffect, useRef, useCallback } from "react";
import { getWebSocketUrl } from "@/services/api";
import type { WSMessage } from "@/types";

interface UseWebSocketOptions {
  workshopId: number | null;
  channel?: string;
  onMessage: (msg: WSMessage) => void;
  enabled?: boolean;
}

const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_DELAY_MS = 3_000;

export function useWebSocket({ workshopId, channel = "all", onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMessageRef = useRef(onMessage);
  const shouldReconnectRef = useRef(false);
  const connectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearHeartbeat();
    clearReconnectTimer();
    shouldReconnectRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    connectionKeyRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  }, [clearHeartbeat, clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!workshopId || !enabled) return;

    const connectionKey = `${workshopId}:${channel}`;
    const current = wsRef.current;
    if (
      current &&
      connectionKeyRef.current === connectionKey &&
      (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    clearReconnectTimer();
    clearHeartbeat();
    shouldReconnectRef.current = true;

    if (current) {
      current.onclose = null;
      current.onerror = null;
      current.onmessage = null;
      current.onopen = null;
      if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
        current.close();
      }
    }

    const ws = new WebSocket(getWebSocketUrl(workshopId, channel));
    wsRef.current = ws;
    connectionKeyRef.current = connectionKey;

    ws.onopen = () => {
      clearReconnectTimer();
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        const active = wsRef.current;
        if (active?.readyState === WebSocket.OPEN) {
          active.send("ping");
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        onMessageRef.current(JSON.parse(event.data));
      } catch {
        // Ignore non-JSON heartbeat or server diagnostics.
      }
    };

    ws.onerror = () => {
      clearHeartbeat();
    };

    ws.onclose = () => {
      clearHeartbeat();
      if (wsRef.current === ws) {
        wsRef.current = null;
        connectionKeyRef.current = null;
      }
      if (shouldReconnectRef.current && enabled && workshopId) {
        clearReconnectTimer();
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, [channel, clearHeartbeat, clearReconnectTimer, enabled, workshopId]);

  useEffect(() => {
    shouldReconnectRef.current = Boolean(enabled && workshopId);
    if (enabled && workshopId) {
      connect();
    } else {
      closeSocket();
    }
    return () => {
      closeSocket();
    };
  }, [closeSocket, connect, enabled, workshopId]);

  return { isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
