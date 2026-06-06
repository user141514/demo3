import { useEffect, useMemo, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { AnswerBubble } from "./AnswerBubble";
import type { Answer } from "@/types";

interface AnswerListProps {
  answers: Answer[];
  questionId: number;
}

export function AnswerList({ answers, questionId }: AnswerListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const questionAnswers = useMemo(
    () =>
      answers
        .filter((answer) => answer.question_id === questionId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        ),
    [answers, questionId]
  );
  const latestAnswerId = questionAnswers[questionAnswers.length - 1]?.id;

  useEffect(() => {
    if (!listRef.current || questionAnswers.length === 0) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [questionAnswers.length, latestAnswerId]);

  if (questionAnswers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
        <MessageSquare className="h-6 w-6 mb-2" />
        <p className="text-sm">暂无回答</p>
        <p className="text-xs">成为第一个回答的人</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {questionAnswers.length} 条回答</span>
        <span>可滚动查看历史回答</span>
      </div>
      <div
        ref={listRef}
        className="max-h-80 min-h-[96px] overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-background/50 p-3 pr-2 [scrollbar-gutter:stable]"
      >
        <div className="space-y-3">
          {questionAnswers.map((answer) => (
            <AnswerBubble key={answer.id} answer={answer} />
          ))}
        </div>
      </div>
    </div>
  );
}
