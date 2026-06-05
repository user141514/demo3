import type { Answer } from "@/types";

interface AnswerBubbleProps {
  answer: Answer;
}

export function AnswerBubble({ answer }: AnswerBubbleProps) {
  const displayName = answer.participant_name || "匿名";
  const time = new Date(answer.created_at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex gap-2 group">
      <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground mt-0.5">
        {displayName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>
        <div className="bg-muted/50 rounded-lg rounded-tl-none px-3 py-2 text-sm text-foreground leading-relaxed">
          {answer.content}
        </div>
      </div>
    </div>
  );
}
