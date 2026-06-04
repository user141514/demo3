import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Edit3,
  Save,
  X,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WSMessage, Answer, Round } from "@/types";

const PANEL_RATIO_KEY = "workshop-member-panel-ratio";
const ROUND_LABELS = ["关键领导力维度", "领导力维度分层", "领导力行为描述", "领导力应用场景"];

const STATUS_CONFIG: Record<string, { label: string; icon: ReactNode }> = {
  locked: { label: "未开启", icon: <Lock className="h-3 w-3" /> },
  active: { label: "进行中", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  input: { label: "填写中", icon: <MessageCircle className="h-3 w-3" /> },
  closing: { label: "收集中", icon: <Clock className="h-3 w-3" /> },
  completed: { label: "已完成", icon: <CheckCircle2 className="h-3 w-3" /> },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function WorkshopPage() {
  const { id } = useParams<{ id: string }>();
  const workshopId = id ? parseInt(id, 10) : null;
  const splitRef = useRef<HTMLDivElement | null>(null);

  const { workshop, participant, loading, error, fetchWorkshop } = useWorkshop(workshopId);
  const groupId = participant?.group_id ?? null;
  const currentRound: Round | undefined = workshop?.rounds.find(
    (r) => r.round_number === workshop.current_round,
  );
  const {
    questions, answers, aiResult, loading: groupLoading, aiLoading,
    submitAnswer, triggerAI, editAIResult, fetchAIResult, addAnswer, clearRoundState,
  } = useGroup(workshopId, groupId, currentRound?.id);
  const isCurrentActive = currentRound?.status === "active" || currentRound?.status === "input";

  const [panelRatio, setPanelRatio] = useState(() => {
    const saved = Number(sessionStorage.getItem(PANEL_RATIO_KEY));
    return Number.isFinite(saved) ? clamp(saved, 0.52, 0.82) : 0.7;
  });
  const [expired, setExpired] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [editingAIResult, setEditingAIResult] = useState(false);
  const [aiResultDraft, setAIResultDraft] = useState("");
  const [savingAIResult, setSavingAIResult] = useState(false);

  const handleExpire = useCallback(() => setExpired(true), []);
  const { remaining, minutes, seconds, isRunning, start, reset } = useCountdown(
    currentRound?.timer_remaining_seconds ?? 0,
    handleExpire,
  );

  const { history, asking, ask, fetchHistory, clearHistory } = useAIAssistant(
    workshopId,
    participant?.id ?? null,
    currentRound?.id,
  );

  useEffect(() => {
    sessionStorage.setItem(PANEL_RATIO_KEY, String(panelRatio));
  }, [panelRatio]);

  useEffect(() => {
    clearHistory();
    if (participant && currentRound) fetchHistory();
  }, [participant?.id, currentRound?.id, fetchHistory, clearHistory]);

  useEffect(() => {
    setExpired(false);
    if (!currentRound || !isCurrentActive || currentRound.timer_remaining_seconds === null) {
      reset(0);
      return;
    }
    if (currentRound.timer_remaining_seconds > 0) {
      start(currentRound.timer_remaining_seconds);
    } else if (currentRound.timer_started_at) {
      reset(0);
      setExpired(true);
    } else {
      reset(0);
    }
  }, [
    currentRound?.id,
    currentRound?.status,
    currentRound?.timer_started_at,
    currentRound?.timer_remaining_seconds,
    isCurrentActive,
    reset,
    start,
  ]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const container = splitRef.current;
    if (!container) return;

    const updateRatio = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const next = clamp((clientX - rect.left) / rect.width, 0.52, 0.82);
      setPanelRatio(next);
    };

    const handleMove = (moveEvent: PointerEvent) => updateRatio(moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    updateRatio(event.clientX);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "new_answer":
        addAnswer(msg.data as unknown as Answer);
        break;
      case "result_ready":
        fetchAIResult();
        break;
      case "round_changed":
        clearRoundState();
        clearHistory();
        fetchWorkshop();
        break;
      case "timer": {
        const secondsRemaining = Number(msg.data.seconds_remaining ?? 0);
        setExpired(false);
        if (secondsRemaining > 0) {
          start(secondsRemaining);
        } else {
          reset(0);
          setExpired(true);
        }
        fetchWorkshop();
        break;
      }
    }
  }, [addAnswer, clearHistory, clearRoundState, fetchAIResult, fetchWorkshop, reset, start]);

  useWebSocket({
    workshopId,
    channel: groupId?.toString() ?? "all",
    onMessage: handleWSMessage,
  });

  const handleTriggerAI = useCallback(async () => {
    await triggerAI();
  }, [triggerAI]);

  const handleSubmitAnswer = useCallback(
    async (questionId: number, _participantId: number, content: string) => {
      if (!participant) throw new Error("请先加入研讨会");
      if (expired) throw new Error("时间已到，无法继续提交");
      return submitAnswer(participant.id, questionId, content);
    },
    [expired, participant, submitAnswer],
  );

  const handleAsk = useCallback(async () => {
    const q = aiQuestion.trim();
    if (!q || asking) return;
    await ask(q);
    setAiQuestion("");
    fetchHistory();
  }, [aiQuestion, asking, ask, fetchHistory]);

  const handleStartEditAIResult = () => {
    setAIResultDraft(aiResult?.edited_content ?? aiResult?.original_content ?? "");
    setEditingAIResult(true);
  };

  const handleSaveAIResult = async () => {
    if (!participant) return;
    const content = aiResultDraft.trim();
    if (!content) return;
    setSavingAIResult(true);
    const result = await editAIResult(participant.id, participant.session_token, content);
    if (result) {
      setEditingAIResult(false);
      setAIResultDraft("");
    }
    setSavingAIResult(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <LoadingSpinner size="lg" text="加载研讨会中..." />
      </div>
    );
  }

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

  if (!workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">研讨会未找到</h2>
          <p className="text-muted-foreground">请检查研讨会 ID 是否正确</p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  const roundStatuses = Array.from({ length: 4 }, (_, i) => {
    const idx = i + 1;
    const found = workshop.rounds.find((r) => r.round_number === idx);
    return {
      number: idx,
      title: ROUND_LABELS[i] ?? `第 ${idx} 轮`,
      status: found?.status ?? "locked",
    };
  });
  const answerDisabled = !isCurrentActive || expired;
  const canEditAIResult = Boolean(participant?.is_group_leader && aiResult);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      <header className="border-b bg-card px-6 py-4 shrink-0">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">{workshop.title}</h1>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {participant && (
                <>
                  <Badge variant="outline">第 {participant.group_id} 组</Badge>
                  {participant.is_group_leader && <Badge variant="default">组长</Badge>}
                </>
              )}
              <span>第 {workshop.current_round} / 4 轮</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
            {roundStatuses.map((rs, index) => {
              const cfg = STATUS_CONFIG[rs.status] ?? STATUS_CONFIG.locked;
              const isCompleted = rs.status === "completed";
              const isCurrent = rs.number === workshop.current_round;
              return (
                <div key={rs.number} className="flex items-center gap-2 shrink-0">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-sm min-w-32",
                      isCurrent && "border-primary bg-primary/10 text-primary",
                      isCompleted && "border-primary/40 bg-primary/5",
                      !isCurrent && !isCompleted && "text-muted-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium",
                        isCompleted && "bg-primary border-primary text-primary-foreground",
                        isCurrent && !isCompleted && "border-primary",
                      )}
                    >
                      {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : rs.number}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{rs.title}</div>
                      <div className="flex items-center gap-1 text-xs">
                        {cfg.icon}
                        {cfg.label}
                      </div>
                    </div>
                  </div>
                  {index < roundStatuses.length - 1 && <div className="h-px w-8 bg-border" />}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <div ref={splitRef} className="flex-1 min-h-0 flex overflow-hidden">
        <main
          className="min-w-[420px] overflow-y-auto"
          style={{ flexBasis: `${panelRatio * 100}%` }}
        >
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
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
                <span className="text-xs">本轮剩余</span>
              </div>
            )}

            {isCurrentActive && !isRunning && !expired && !currentRound?.timer_started_at && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>等待主持人开始计时</span>
              </div>
            )}

            {isCurrentActive && expired && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>时间已到，无法继续提交回答</span>
              </div>
            )}

            {currentRound && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary">第 {currentRound.round_number} 轮</Badge>
                  <Badge variant="outline">
                    {STATUS_CONFIG[currentRound.status]?.label ?? currentRound.status}
                  </Badge>
                </div>
                <h2 className="text-2xl font-bold">{currentRound.title}</h2>
                {currentRound.objective && (
                  <p className="text-sm text-muted-foreground mt-1">{currentRound.objective}</p>
                )}
              </div>
            )}

            <Separator />

            {groupLoading ? (
              <div className="py-12">
                <LoadingSpinner size="md" text="加载问题中..." />
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageCircle className="h-8 w-8 mb-2" />
                <p className="text-sm">暂无问题</p>
                <p className="text-xs mt-1">等待主持人开启本轮...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {questions.map((question) => (
                  <div key={question.id} className="space-y-4">
                    <QuestionCard question={question} />
                    <div className="pl-4 border-l-2 border-muted space-y-4">
                      <AnswerList answers={answers} questionId={question.id} />
                      {participant ? (
                        <AnswerInput
                          questionId={question.id}
                          participantId={participant.id}
                          onSubmit={handleSubmitAnswer}
                          disabled={answerDisabled}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">请先加入研讨会后再回答</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <button
          type="button"
          className="w-3 shrink-0 border-x bg-muted/30 hover:bg-muted flex items-center justify-center cursor-col-resize"
          aria-label="调整问题区和侧边栏宽度"
          onPointerDown={handleDragStart}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <aside className="min-w-[300px] flex-1 bg-card overflow-y-auto">
          <div className="p-4 space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  小组成员
                </CardTitle>
              </CardHeader>
              <CardContent>
                {participant ? (
                  <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {participant.name.charAt(0)}
                      </div>
                      <span className="text-sm truncate">{participant.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {participant.is_group_leader && <Badge variant="default">组长</Badge>}
                      <Badge variant="outline">第 {participant.group_id} 组</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">暂无成员信息</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI 提炼结果
                  </CardTitle>
                  {aiResult && (
                    <Badge variant={aiResult.status === "edited" ? "default" : "outline"}>
                      {aiResult.status === "edited" ? "已编辑" : aiResult.status}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiResult ? (
                  editingAIResult ? (
                    <div className="space-y-3">
                      <Textarea
                        value={aiResultDraft}
                        onChange={(event) => setAIResultDraft(event.target.value)}
                        rows={12}
                        className="text-sm font-mono"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveAIResult} disabled={savingAIResult} className="gap-1">
                          {savingAIResult ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
                          保存
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingAIResult(false)} className="gap-1">
                          <X className="h-4 w-4" />
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {aiResult.edited_content ?? aiResult.original_content ?? "暂无内容"}
                      </div>
                      {canEditAIResult && (
                        <Button size="sm" variant="outline" onClick={handleStartEditAIResult} className="gap-1">
                          <Edit3 className="h-4 w-4" />
                          编辑结果
                        </Button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                    <Sparkles className="h-6 w-6" />
                    <p className="text-xs text-center">AI 尚未生成结果</p>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={handleTriggerAI}
                  disabled={aiLoading || !isCurrentActive}
                >
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? "生成中..." : "AI 提炼"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  AI 问答
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-72 rounded-md border bg-background">
                  <div className="space-y-3 p-3">
                    {history.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">暂无问答记录</p>
                    )}
                    {history.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="bg-primary/10 rounded-md px-3 py-2 text-sm max-w-[85%]">
                            {item.question}
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-md px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
                            {item.answer ?? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                回答生成中...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex gap-2">
                  <Input
                    placeholder="输入你的问题..."
                    value={aiQuestion}
                    onChange={(event) => setAiQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleAsk();
                      }
                    }}
                    disabled={asking || !participant}
                  />
                  <Button size="icon" onClick={handleAsk} disabled={asking || !aiQuestion.trim() || !participant}>
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
