import { useEffect, useState } from "react";
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
  submitDisabled?: boolean;
  submitHint?: string;
  draftKey?: string;
}

export function AnswerInput({
  questionId,
  participantId,
  onSubmit,
  disabled = false,
  submitDisabled = false,
  submitHint,
  draftKey,
}: AnswerInputProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftKey) return;
    setContent(sessionStorage.getItem(draftKey) ?? "");
    setError(null);
  }, [draftKey]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || disabled || submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(questionId, participantId, trimmed);
      setContent("");
      if (draftKey) sessionStorage.removeItem(draftKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请重试");
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
            const next = e.target.value;
            setContent(next);
            if (draftKey) sessionStorage.setItem(draftKey, next);
            setError(null);
          }}
          disabled={disabled || submitting}
          className="min-h-[88px] max-h-72 overflow-y-auto text-sm resize-y"
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
          disabled={disabled || submitDisabled || submitting || !content.trim()}
          className="shrink-0 self-end"
          title={submitDisabled ? submitHint : undefined}
        >
          {submitting ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!disabled && submitDisabled && submitHint && (
        <p className="text-xs text-muted-foreground">{submitHint}</p>
      )}
    </div>
  );
}
