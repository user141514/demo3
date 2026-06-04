import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useWorkshop } from "@/hooks/useWorkshop";
import { useGroup } from "@/hooks/useGroup";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { useCountdown } from "@/hooks/useCountdown";
import { QuestionCard } from "@/components/Questions/QuestionCard";
import { AnswerInput } from "@/components/Questions/AnswerInput";
import { AnswerList } from "@/components/Questions/AnswerList";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Send,
  Sparkles,
  Users,
  Clock,
  AlertCircle,
  Lock,
  MessageCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WSMessage, Answer, Round } from "@/types";

const ROUND_LABELS = ["现状认知", "理想特质", "差距分析", "行动规划"];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: string }> = {
  locked: { label: "未开启", icon: <Lock className="h-3 w-3" />, variant: "muted" },
  active: { label: "讨论中", icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "primary" },
  input: { label: "输入中", icon: <MessageCircle className="h-3 w-3" />, variant: "primary" },
  closing: { label: "收集中", icon: <Clock className="h-3 w-3" />, variant: "warning" },
  completed: { label: "已完成", icon: <CheckCircle2 className="h-3 w-3" />, variant: "success" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkshopPage() {
  const { id } = useParams<{ id: string }>();
  const workshopId = id ? parseInt(id, 10) : null;

  // ── Data ──────────────────────────────────────────────────────────────
  const { workshop, participant, loading, error, fetchWorkshop } = useWorkshop(workshopId);
  const groupId = participant?.group_id ?? null;
  const {
    questions, answers, aiResult, loading: groupLoading, aiLoading,
    submitAnswer, triggerAI, fetchAIResult, addAnswer,
  } = useGroup(workshopId, groupId);

  // ── Current round ─────────────────────────────────────────────────────
  const currentRound: Round | undefined = workshop?.rounds.find(
    (r) => r.round_number === workshop.current_round
  );
  const isCurrentActive = currentRound?.status === "active" || currentRound?.status === "input";

  // ── Countdown ─────────────────────────────────────────────────────────
  const [expired, setExpired] = useState(false);
  const handleExpire = useCallback(() => setExpired(true), []);
  const countdownSecs = currentRound?.status === "active"
    ? currentRound.discussion_time
    : currentRound?.status === "input"
      ? currentRound.input_time
      : 0;
  const { remaining, minutes, seconds, isRunning, start } = useCountdown(countdownSecs, handleExpire);

  const prevRoundIdRef = useRef<number | undefined>(undefined);
  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!currentRound) return;
    const roundChanged = currentRound.id !== prevRoundIdRef.current;
    const statusChanged = currentRound.status !== prevStatusRef.current;
    if (roundChanged || statusChanged) {
      setExpired(false);
      if (currentRound.status === "active" && currentRound.discussion_time > 0) {
        start(currentRound.discussion_time);
      } else if (currentRound.status === "input" && currentRound.input_time > 0) {
        start(currentRound.input_time);
      }
      prevRoundIdRef.current = currentRound.id;
      prevStatusRef.current = currentRound.status;
    }
  }, [currentRound, start]);

  // ── AI Assistant ──────────────────────────────────────────────────────
  const { history, asking, ask, fetchHistory } = useAIAssistant(workshopId, participant?.id ?? null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");

  const handleAsk = useCallback(async () => {
    const q = aiQuestion.trim();
    if (!q || asking) return;
    await ask(q);
    setAiQuestion("");
  }, [aiQuestion, asking, ask]);

  useEffect(() => {
    if (aiDialogOpen) fetchHistory();
  }, [aiDialogOpen, fetchHistory]);

  // ── WebSocket ─────────────────────────────────────────────────────────
  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "new_answer":
        addAnswer(msg.data as unknown as Answer);
        break;
      case "result_ready":
        fetchAIResult();
        break;
      case "round_changed":
        fetchWorkshop();
        break;
    }
  }, [addAnswer, fetchAIResult, fetchWorkshop]);

  useWebSocket({
    workshopId,
    channel: groupId?.toString() ?? "all",
    onMessage: handleWSMessage,
  });

  // ── AI trigger ────────────────────────────────────────────────────────
  const handleTriggerAI = useCallback(async () => {
    await triggerAI();
  }, [triggerAI]);

  // ── Submit answer wrapper ─────────────────────────────────────────────
  const handleSubmitAnswer = useCallback(
    async (questionId: number, _participantId: number, content: string) => {
      if (!participant) throw new Error("请先加入工作坊");
      return submitAnswer(participant.id, questionId, content);
    },
    [participant, submitAnswer],
  );

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <LoadingSpinner size="lg" text="加载工作坊中..." />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">加载失败</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────
  if (!workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">工作坊未找到</h2>
          <p className="text-muted-foreground">请检查工作坊 ID 是否正确</p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  const roundStatuses: { number: number; title: string; status: string }[] = Array.from(
    { length: 4 },
    (_, i) => {
      const idx = i + 1;
      const found = workshop.rounds.find((r) => r.round_number === idx);
      return {
        number: idx,
        title: ROUND_LABELS[i] ?? `第 ${idx} 轮`,
        status: found?.status ?? "locked",
      };
    },
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Left Sidebar: RoundProgress ─────────────────────────────── */}
      <aside className="w-56 border-r bg-card flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 flex-1">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">研讨进程</h3>
          <div className="space-y-1">
            {roundStatuses.map((rs, index) => {
              const cfg = STATUS_CONFIG[rs.status] ?? STATUS_CONFIG.locked;
              const isCompleted = rs.status === "completed";
              const isCurrent = rs.number === workshop.current_round;
              return (
                <div key={rs.number}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-2 py-2.5 rounded-md transition-colors",
                      isCurrent && "bg-primary/10",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isCompleted && "bg-primary border-primary text-primary-foreground",
                        isCurrent && !isCompleted && "border-primary text-primary",
                        !isCompleted && !isCurrent && "border-muted-foreground/30 text-muted-foreground/50",
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-xs font-medium">{rs.number}</span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={cn(
                          "text-sm font-medium truncate",
                          isCurrent && !isCompleted && "text-primary",
                          isCompleted && "text-muted-foreground",
                          !isCurrent && !isCompleted && "text-muted-foreground/60",
                        )}
                      >
                        {rs.title}
                      </span>
                      <span
                        className={cn(
                          "text-xs flex items-center gap-1",
                          isCurrent && !isCompleted && "text-primary",
                          isCompleted && "text-muted-foreground",
                          !isCurrent && !isCompleted && "text-muted-foreground/40",
                        )}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  {index < roundStatuses.length - 1 && (
                    <div className="ml-[1.125rem] pl-5">
                      <div
                        className={cn(
                          "w-px h-3",
                          rs.status === "completed" || roundStatuses[index + 1]?.status === "completed"
                            ? "bg-primary"
                            : "bg-muted-foreground/20",
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {workshop.status === "completed" && (
            <div className="mt-6 px-2">
              <Badge variant="default" className="w-full justify-center gap-1 py-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                研讨已结束
              </Badge>
            </div>
          )}
        </div>
      </aside>

      {/* ── Center: Round + Questions ───────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {/* Group assignment card */}
          {participant && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {participant.group_id}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      第 {participant.group_id} 组
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {participant.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {participant.is_group_leader && (
                    <Badge variant="default">组长</Badge>
                  )}
                  <Badge variant="outline">成员</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Countdown */}
          {isCurrentActive && isRunning && !expired && (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm",
                remaining <= 60
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
              )}
            >
              <Clock className="h-4 w-4" />
              <span className="font-mono font-bold tabular-nums">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
              <span className="text-xs">{currentRound?.status === "active" ? "讨论剩余" : "输入剩余"}</span>
            </div>
          )}

          {isCurrentActive && expired && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>时间到，请等待下一步</span>
            </div>
          )}

          {/* Round header */}
          {currentRound && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">第 {currentRound.round_number} 轮</Badge>
                {currentRound.status && (
                  <Badge variant="outline" className="capitalize">
                    {STATUS_CONFIG[currentRound.status]?.label ?? currentRound.status}
                  </Badge>
                )}
              </div>
              <h2 className="text-2xl font-bold">{currentRound.title}</h2>
              {currentRound.objective && (
                <p className="text-sm text-muted-foreground mt-1">{currentRound.objective}</p>
              )}
            </div>
          )}

          <Separator />

          {/* Questions + AnswerInput */}
          {groupLoading ? (
            <div className="py-12">
              <LoadingSpinner size="md" text="加载问题中..." />
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">暂无问题</p>
              <p className="text-xs mt-1">等待 AI 生成问题...</p>
            </div>
          ) : (
            <div className="space-y-8">
              {questions.map((question) => {
                return (
                  <div key={question.id} className="space-y-4">
                    <QuestionCard question={question} />
                    <div className="pl-4 border-l-2 border-muted space-y-4">
                      <AnswerList answers={answers} questionId={question.id} />
                      {participant && (
                        <AnswerInput
                          questionId={question.id}
                          participantId={participant.id}
                          onSubmit={handleSubmitAnswer}
                          disabled={!isCurrentActive}
                        />
                      )}
                      {!participant && (
                        <p className="text-xs text-muted-foreground">请先加入工作坊后再回答</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── Right Sidebar ──────────────────────────────────────────── */}
      <aside className="w-72 border-l bg-card flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Group Members */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">小组成员</span>
            </div>
            {participant ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between py-2 px-1 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {participant.name.charAt(0)}
                    </div>
                    <span className="text-sm">{participant.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {participant.is_group_leader && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">组长</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      第 {participant.group_id} 组
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">暂无成员信息</p>
            )}
          </div>

          <Separator />

          {/* AI Result Card */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI 提炼结果</span>
            </div>
            {aiResult ? (
              <Card className="border-primary/20">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        aiResult.status === "ready" ? "default" :
                        aiResult.status === "processing" ? "secondary" : "outline"
                      }
                      className="text-[10px]"
                    >
                      {aiResult.status === "ready" ? "已完成" :
                       aiResult.status === "processing" ? "生成中" :
                       aiResult.status === "edited" ? "已编辑" : "待处理"}
                    </Badge>
                  </div>
                  {(aiResult.edited_content ?? aiResult.original_content) ? (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                      {aiResult.edited_content ?? aiResult.original_content}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无内容</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                <Sparkles className="h-6 w-6" />
                <p className="text-xs text-center">AI 尚未生成结果</p>
              </div>
            )}

            {/* AI trigger button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 gap-1.5"
              onClick={handleTriggerAI}
              disabled={aiLoading || !isCurrentActive}
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {aiLoading ? "生成中..." : "AI 提炼"}
            </Button>
          </div>

          <Separator />

          {/* AI Q&A button */}
          <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="w-full gap-1.5">
                <MessageCircle className="h-4 w-4" />
                AI 问答
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI 助手问答
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Input area */}
                <div className="flex gap-2">
                  <Input
                    placeholder="输入您的问题..."
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    disabled={asking}
                  />
                  <Button size="icon" onClick={handleAsk} disabled={asking || !aiQuestion.trim()}>
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                {/* History */}
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3 pr-3">
                    {history.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">暂无问答记录</p>
                    )}
                    {history.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="bg-primary/10 rounded-lg rounded-tr-none px-3 py-2 text-sm max-w-[80%]">
                            {item.question}
                          </div>
                        </div>
                        {item.answer && (
                          <div className="flex justify-start">
                            <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-[80%]">
                              {item.answer}
                            </div>
                          </div>
                        )}
                        {!item.answer && (
                          <div className="flex justify-start">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> 回答生成中...
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </aside>
    </div>
  );
}
