import { MessageSquare } from "lucide-react";
import { AnswerBubble } from "./AnswerBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Answer } from "@/types";

interface AnswerListProps {
  answers: Answer[];
  questionId: number;
}

export function AnswerList({ answers, questionId }: AnswerListProps) {
  const questionAnswers = answers.filter(
    (a) => a.question_id === questionId
  );

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
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-3 pr-3">
        {questionAnswers
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          )
          .map((answer) => (
            <AnswerBubble key={answer.id} answer={answer} />
          ))}
      </div>
    </ScrollArea>
  );
}
