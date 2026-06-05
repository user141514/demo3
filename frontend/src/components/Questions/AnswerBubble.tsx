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
    <div className="flex min-w-0 gap-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {displayName.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {time}
          </span>
        </div>
        <div className="max-w-full whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
          {answer.content}
        </div>
      </div>
    </div>
  );
}
