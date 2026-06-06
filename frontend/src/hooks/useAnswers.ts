import { useState, useCallback } from "react";
import { groupApi } from "@/services/api";
import type { Answer, Question } from "@/types";

export function useAnswers(groupId: number | null, workshopId: number | null) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    if (!groupId || !workshopId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await groupApi.getQuestions(groupId, workshopId);
      setQuestions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "获取问题列表失败"
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, workshopId]);

  const fetchAnswers = useCallback(async () => {
    if (!groupId || !workshopId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await groupApi.getAnswers(groupId, workshopId);
      setAnswers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "获取回答列表失败"
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, workshopId]);

  const submitAnswer = useCallback(
    async (
      questionId: number,
      participantId: number,
      sessionToken: string,
      content: string
    ) => {
      if (!groupId) return null;
      setSubmitting(true);
      setError(null);
      try {
        const data = await groupApi.submitAnswer(groupId, {
          question_id: questionId,
          participant_id: participantId,
          session_token: sessionToken,
          content,
        });
        setAnswers((prev) => [...prev, data]);
        return data;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "提交回答失败"
        );
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [groupId]
  );

  const addAnswer = useCallback((answer: Answer) => {
    setAnswers((prev) => {
      if (prev.some((a) => a.id === answer.id)) return prev;
      return [...prev, answer];
    });
  }, []);

  const getAnswersForQuestion = useCallback(
    (questionId: number) => {
      return answers.filter((a) => a.question_id === questionId);
    },
    [answers]
  );

  return {
    questions,
    answers,
    loading,
    submitting,
    error,
    fetchQuestions,
    fetchAnswers,
    submitAnswer,
    addAnswer,
    getAnswersForQuestion,
  };
}
