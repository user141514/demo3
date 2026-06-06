import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoundProgressProps {
  currentRound: number;
  onNextRound: () => void;
  nextRoundLoading?: boolean;
  isLastRound?: boolean;
  rounds?: { number: number; title: string }[];
}

const DEFAULT_ROUNDS = [
  { number: 1, title: "现状认知" },
  { number: 2, title: "理想特质" },
  { number: 3, title: "差距分析" },
  { number: 4, title: "行动规划" },
];

export function RoundProgress({
  currentRound,
  onNextRound,
  nextRoundLoading = false,
  isLastRound = false,
  rounds = DEFAULT_ROUNDS,
}: RoundProgressProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
          研讨进程
        </h3>
        {rounds.map((round, index) => {
          const isCompleted = round.number < currentRound;
          const isActive = round.number === currentRound;
          const isPending = round.number > currentRound;

          return (
            <div key={round.number} className="flex items-start gap-3 px-2 py-2">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isCompleted &&
                      "bg-primary border-primary text-primary-foreground",
                    isActive &&
                      "border-primary text-primary",
                    isPending &&
                      "border-muted-foreground/30 text-muted-foreground/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-xs font-medium">
                      {round.number}
                    </span>
                  )}
                </div>
                {index < rounds.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 h-6 mt-1",
                      isCompleted
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </div>
              <div className="flex flex-col pt-1">
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    isActive && "text-primary",
                    isCompleted && "text-muted-foreground",
                    isPending && "text-muted-foreground/50"
                  )}
                >
                  {round.title}
                </span>
                {isActive && (
                  <span className="text-xs text-primary mt-0.5">
                    当前轮次
                  </span>
                )}
                {isCompleted && (
                  <span className="text-xs text-muted-foreground mt-0.5">
                    已完成
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-2 pt-4 border-t">
        <Button
          onClick={onNextRound}
          disabled={nextRoundLoading || isLastRound}
          className="w-full gap-1"
          size="sm"
        >
          {nextRoundLoading ? (
            "处理中..."
          ) : isLastRound ? (
            "最后一轮"
          ) : (
            <>
              下一轮
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
