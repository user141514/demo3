import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";

interface SummarizeButtonProps {
  roundId: number;
  onSummarize: (roundId: number) => Promise<unknown>;
  disabled?: boolean;
}

export function SummarizeButton({
  roundId,
  onSummarize,
  disabled = false,
}: SummarizeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSummarize(roundId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "汇总失败，请重试"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={disabled || loading}
        className="w-full gap-2"
        variant="secondary"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 正在汇总...
          </>
        ) : (
          <>
            <Brain className="h-4 w-4" />
            AI 汇总
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
