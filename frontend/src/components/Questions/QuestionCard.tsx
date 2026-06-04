import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { Question } from "@/types";

interface QuestionCardProps {
  question: Question;
}

export function QuestionCard({ question }: QuestionCardProps) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary">AI 导师</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {question.content}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
