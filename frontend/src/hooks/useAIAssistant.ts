import { useState, useCallback, useEffect } from "react";
import { aiApi } from "@/services/api";
import type { AIQuestion } from "@/types";

export function useAIAssistant(workshopId: number | null, participantId: number | null, roundId?: number | null) {
  const [history, setHistory] = useState<AIQuestion[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const ask = useCallback(async (question: string) => {
    if (!workshopId || !participantId) return null;
    setAsking(true);
    setError(null);
    try {
      const a = await aiApi.ask(workshopId, participantId, question);
      setHistory((prev) => [a, ...prev]);
      return a;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 问答失败，请稍后重试");
      return null;
    } finally {
      setAsking(false);
    }
  }, [workshopId, participantId]);

  const fetchHistory = useCallback(async () => {
    if (!workshopId || !participantId) return;
    try {
      setHistory(await aiApi.getHistory(workshopId, participantId));
    } catch { /* ignore */ }
  }, [workshopId, participantId, roundId]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { history, asking, error, ask, fetchHistory, clearHistory, clearError };
}
