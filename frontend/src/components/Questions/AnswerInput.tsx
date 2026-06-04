import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";

interface AnswerInputProps {
  questionId: number;
  participantId: number;
  onSubmit: (
    questionId: number,
    participantId: number,
    content: string
  ) => Promise<unknown>;
  disabled?: boolean;
}

export function AnswerInput({
  questionId,
  participantId,
  onSubmit,
  disabled = false,
}: AnswerInputProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(questionId, participantId, trimmed);
      setContent("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "提交失败，请重试"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Textarea
          placeholder="输入您的回答..."
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setError(null);
          }}
          disabled={disabled || submitting}
          className="min-h-[60px] text-sm resize-none"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={
            disabled || submitting || !content.trim()
          }
          className="shrink-0 self-end"
        >
          {submitting ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
