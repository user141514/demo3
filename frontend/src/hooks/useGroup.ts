import { useState, useEffect, useCallback } from "react";
import { groupApi } from "@/services/api";
import type { Question, Answer, GroupRoundResult } from "@/types";

export function useGroup(workshopId: number | null, groupId: number | null, roundId?: number | null) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [aiResult, setAiResult] = useState<GroupRoundResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    if (!workshopId || !groupId) return;
    setLoading(true);
    try {
      setQuestions(await groupApi.getQuestions(groupId, workshopId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取问题失败");
    } finally {
      setLoading(false);
    }
  }, [workshopId, groupId]);

  const fetchAnswers = useCallback(async () => {
    if (!workshopId || !groupId) return;
    try {
      setAnswers(await groupApi.getAnswers(groupId, workshopId));
    } catch { /* ignore */ }
  }, [workshopId, groupId]);

  const fetchAIResult = useCallback(async () => {
    if (!workshopId || !groupId) return;
    try {
      const r = await groupApi.getAIResult(groupId, workshopId);
      setAiResult(r);
    } catch { /* not ready yet */ }
  }, [workshopId, groupId]);

  const clearRoundState = useCallback(() => {
    setQuestions([]);
    setAnswers([]);
    setAiResult(null);
    setError(null);
  }, []);

  const submitAnswer = useCallback(async (participant_id: number, question_id: number, content: string) => {
    if (!groupId) return null;
    try {
      const a = await groupApi.submitAnswer(groupId, { participant_id, question_id, content });
      setAnswers((prev) => [...prev, a]);
      return a;
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      return null;
    }
  }, [groupId]);

  const triggerAI = useCallback(async () => {
    if (!workshopId || !groupId) return null;
    setAiLoading(true);
    try {
      const r = await groupApi.triggerAI(groupId, workshopId);
      setAiResult(r);
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI生成失败");
      return null;
    } finally {
      setAiLoading(false);
    }
  }, [workshopId, groupId]);

  const editAIResult = useCallback(async (
    participant_id: number,
    session_token: string,
    edited_content: string,
  ) => {
    if (!workshopId || !groupId) return null;
    try {
      const r = await groupApi.editAIResult(
        groupId,
        workshopId,
        participant_id,
        session_token,
        edited_content,
      );
      setAiResult(r);
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 AI 结果失败");
      return null;
    }
  }, [workshopId, groupId]);

  const addAnswer = useCallback((answer: Answer) => {
    setAnswers((prev) => {
      if (prev.some((a) => a.id === answer.id)) return prev;
      return [...prev, answer];
    });
  }, []);

  useEffect(() => {
    if (workshopId && groupId) {
      clearRoundState();
      fetchQuestions();
      fetchAnswers();
      fetchAIResult();
    }
  }, [workshopId, groupId, roundId, clearRoundState, fetchQuestions, fetchAnswers, fetchAIResult]);

  return {
    questions, answers, aiResult,
    loading, aiLoading, error,
    fetchQuestions, fetchAnswers, fetchAIResult, clearRoundState,
    submitAnswer, triggerAI, editAIResult, addAnswer,
  };
}
