import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkshopHost } from "@/hooks/useWorkshopHost";
import { useWebSocket } from "@/hooks/useWebSocket";
import { groupApi, knowledgeApi } from "@/services/api";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  FileUp,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";
import { copyText } from "@/lib/copyText";
import type { Answer, GroupRoundResult, RoundInfo, WSMessage } from "@/types";

const ROUND_STATUS_LABEL: Record<string, string> = {
  locked: "已锁定",
  active: "讨论中",
  input: "填写中",
  closing: "收尾中",
  completed: "已完成",
};

const ROUND_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  locked: "outline",
  active: "default",
  input: "secondary",
  closing: "secondary",
  completed: "outline",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function finalResultContent(result: GroupRoundResult) {
  return result.edited_content ?? result.original_content ?? "";
}

function resultStatusLabel(status: string) {
  if (status === "edited") return "已编辑";
  if (status === "ready") return "已就绪";
  if (status === "processing") return "处理中";
  if (status === "validation_failed") return "验证失败";
  return "待处理";
}

export function HostDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const workshopId = id ? parseInt(id, 10) : null;
  const hostCode = searchParams.get("code");

  const {
    workshop,
    loading,
    error,
    fetchHost,
    unlockRound,
    updateRoundSettings,
    startTimer,
    submitHostInput,
    editGroupResult,
    editSynthesis,
    exportMarkdown,
  } = useWorkshopHost(workshopId, hostCode);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedGroup, setSelectedGroup] = useState("1");
  const [selectedResultRound, setSelectedResultRound] = useState("1");
  const [editingResultId, setEditingResultId] = useState<number | null>(null);
  const [editingResultContent, setEditingResultContent] = useState("");

  const [selectedSynthesisRound, setSelectedSynthesisRound] = useState("1");
  const [editingSynthesis, setEditingSynthesis] = useState(false);
  const [synthesisEditContent, setSynthesisEditContent] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);

  const [roundTime, setRoundTime] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [startingTimer, setStartingTimer] = useState(false);

  const [hostInputContent, setHostInputContent] = useState("");
  const [savingHostInput, setSavingHostInput] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<{ markdown: string; filename: string } | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentRound = workshop?.rounds[Math.max(0, (workshop?.current_round ?? 1) - 1)] ?? null;
  const selectedResultRoundInfo =
    workshop?.rounds.find((round) => round.round_number === parseInt(selectedResultRound, 10)) ?? currentRound;
  const selectedSynthesisRoundInfo =
    workshop?.rounds.find((round) => round.round_number === parseInt(selectedSynthesisRound, 10)) ?? currentRound;

  useEffect(() => {
    if (!workshop || workshop.rounds.length === 0) return;
    const next = String(workshop.current_round);
    setSelectedResultRound((value) => value || next);
    setSelectedSynthesisRound((value) => value || next);
  }, [workshop?.current_round, workshop?.rounds.length]);

  useEffect(() => {
    if (!workshop || workshop.rounds.length === 0) return;
    const round = workshop.rounds[workshop.current_round - 1];
    if (round) setRoundTime(String(round.discussion_time ?? round.input_time ?? ""));
  }, [workshop?.current_round, workshop?.rounds]);

  useEffect(() => {
    if (!currentRound) return;
    setHostInputContent(currentRound.host_input?.content ?? "");
  }, [currentRound?.id, currentRound?.host_input?.content]);

  useEffect(() => {
    if (!localError) return;
    const timer = window.setTimeout(() => setLocalError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [localError]);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (["result_ready", "synthesis_ready", "round_changed", "new_answer", "timer"].includes(msg.type)) {
      fetchHost();
    }
  }, [fetchHost]);

  useWebSocket({
    workshopId,
    channel: "host",
    onMessage: handleWSMessage,
    enabled: !!workshopId && !!hostCode,
  });

  const clearLocalError = () => setLocalError(null);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (!(err instanceof Error)) return fallback;
    return err.message.replace(/^API error \d+:\s*/, "") || fallback;
  };

  const handleCopyText = async (text: string | null | undefined, key: string) => {
    const content = text?.trim();
    if (!content) {
      setLocalError("没有可复制的内容");
      return;
    }
    try {
      await copyText(content);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "复制失败，请重试");
    }
  };

  const copyButton = (text: string | null | undefined, key: string) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1"
      onClick={() => handleCopyText(text, key)}
    >
      {copiedKey === key ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copiedKey === key ? "已复制" : "复制"}
    </Button>
  );

  const handleUnlockRound = async () => {
    setUnlocking(true);
    clearLocalError();
    const result = await unlockRound();
    if (!result) setLocalError("进入下一轮失败，请重试");
    setUnlocking(false);
  };

  const handleUpdateSettings = async () => {
    clearLocalError();
    const minutes = roundTime ? parseInt(roundTime, 10) : undefined;
    const result = await updateRoundSettings(minutes, minutes);
    if (!result) setLocalError("更新设置失败，请重试");
  };

  const handleStartTimer = async () => {
    setStartingTimer(true);
    clearLocalError();
    const result = await startTimer();
    if (!result) setLocalError("开始计时失败，请重试");
    setStartingTimer(false);
  };

  const handleStartEditResult = (result: GroupRoundResult) => {
    setEditingResultId(result.id);
    setEditingResultContent(result.edited_content ?? result.original_content ?? "");
  };

  const handleSaveEditResult = async () => {
    if (editingResultId === null) return;
    clearLocalError();
    const result = await editGroupResult(editingResultId, editingResultContent);
    if (result) {
      setEditingResultId(null);
      setEditingResultContent("");
      fetchHost();
    } else {
      setLocalError("保存编辑结果失败");
    }
  };

  const handleTriggerSynthesis = async () => {
    if (!selectedSynthesisRoundInfo) return;
    setSynthesizing(true);
    clearLocalError();
    try {
      await groupApi.synthesize(selectedSynthesisRoundInfo.id);
      await fetchHost();
    } catch (err) {
      setLocalError(getErrorMessage(err, "综合提炼失败，请重试"));
    } finally {
      setSynthesizing(false);
    }
  };

  const handleStartEditSynthesis = () => {
    if (!selectedSynthesisRoundInfo?.synthesis) return;
    setSynthesisEditContent(
      selectedSynthesisRoundInfo.synthesis.edited_content ??
      selectedSynthesisRoundInfo.synthesis.original_content ??
      "",
    );
    setEditingSynthesis(true);
  };

  const handleSaveEditSynthesis = async () => {
    if (!selectedSynthesisRoundInfo) return;
    clearLocalError();
    const result = await editSynthesis(selectedSynthesisRoundInfo.id, synthesisEditContent);
    if (result) {
      setEditingSynthesis(false);
      fetchHost();
    } else {
      setLocalError("保存综合编辑失败");
    }
  };

  const handleSaveHostInput = async () => {
    if (!currentRound) return;
    setSavingHostInput(true);
    clearLocalError();
    const result = await submitHostInput(currentRound.id, hostInputContent);
    if (!result) setLocalError("保存主持人输入失败");
    setSavingHostInput(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !workshop) return;
    setUploading(true);
    clearLocalError();
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        if (!base64) {
          setLocalError("文件读取失败");
          setUploading(false);
          return;
        }
        await knowledgeApi.upload(
          file.name,
          base64,
          file.type || "application/octet-stream",
          workshop.id,
          workshop.kb_admin_code,
        );
        await fetchHost();
        setUploading(false);
      };
      reader.onerror = () => {
        setLocalError("文件读取失败");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setLocalError(getErrorMessage(err, "上传失败"));
      setUploading(false);
    }
    event.target.value = "";
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!workshop) return;
    setDeletingDocId(docId);
    clearLocalError();
    try {
      await knowledgeApi.delete(docId, workshop.id, workshop.kb_admin_code);
      await fetchHost();
    } catch (err) {
      setLocalError(getErrorMessage(err, "删除失败"));
    }
    setDeletingDocId(null);
  };

  const handleExport = async () => {
    setExporting(true);
    clearLocalError();
    const data = await exportMarkdown();
    if (data) {
      setExportData(data);
      setShowExportDialog(true);
    } else {
      setLocalError("导出失败");
    }
    setExporting(false);
  };

  const handleDownloadExport = () => {
    if (!exportData) return;
    const blob = new Blob([exportData.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportData.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const answersForQuestion = (round: RoundInfo, questionId: number, groupId: number): Answer[] =>
    round.answers.filter((answer) => answer.question_id === questionId && answer.group_id === groupId);

  if (loading && !workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <LoadingSpinner size="lg" text="加载主持人面板..." />
      </div>
    );
  }

  if (error && !workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">加载失败</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={fetchHost}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (!workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertTriangle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">研讨会未找到</h2>
          <p className="text-muted-foreground">请检查链接或主持人码是否正确</p>
          <Button variant="outline" onClick={fetchHost}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  const selectedGroupId = parseInt(selectedGroup, 10);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      <header className="border-b bg-card px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/" className="text-xl font-bold hover:text-primary transition-colors">
              {workshop.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              主持人: {workshop.host_name} &middot;
              邀请码: <code className="font-mono bg-muted px-1 rounded">{workshop.invite_code}</code> &middot;
              第 {workshop.current_round} / 4 轮
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={workshop.status === "active" ? "default" : "secondary"}>
              {workshop.status === "active" ? "进行中" : "已结束"}
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchHost}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {localError && (
        <div className="bg-destructive/10 text-destructive text-sm px-6 py-2">
          <div className="max-w-7xl mx-auto">{localError}</div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b px-6 flex justify-center">
          <TabsList className="h-12 flex-wrap justify-center">
            <TabsTrigger value="overview">总览</TabsTrigger>
            <TabsTrigger value="round-control">轮次管理</TabsTrigger>
            <TabsTrigger value="group-results">各组成果</TabsTrigger>
            <TabsTrigger value="synthesis">综合汇总</TabsTrigger>
            <TabsTrigger value="host-input">主持人输入</TabsTrigger>
            <TabsTrigger value="knowledge">知识库</TabsTrigger>
            <TabsTrigger value="export">导出</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">研讨会信息</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">标题</p>
                    <p className="font-medium">{workshop.title}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">主持人</p>
                    <p className="font-medium">{workshop.host_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">当前轮次</p>
                    <p className="font-medium">{workshop.current_round} / 4</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">状态</p>
                    <Badge variant={workshop.status === "active" ? "default" : "secondary"}>
                      {workshop.status === "active" ? "进行中" : "已结束"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">邀请码</p>
                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">{workshop.invite_code}</code>
                  </div>
                  <div>
                    <p className="text-muted-foreground">主持人码</p>
                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">{workshop.host_code}</code>
                  </div>
                  <div>
                    <p className="text-muted-foreground">创建时间</p>
                    <p className="font-medium">{new Date(workshop.created_at).toLocaleString("zh-CN")}</p>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-base font-semibold mb-3">分组概览</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {workshop.groups.map((group) => (
                    <Card key={group.group_id}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                          {group.group_id}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">第 {group.group_id} 组</p>
                          <p className="text-sm text-muted-foreground">
                            <Users className="h-3.5 w-3.5 inline mr-1" />
                            {group.participant_count} 人
                          </p>
                          <p className="text-sm text-muted-foreground">
                            组长: {group.leader_name ?? "暂无组长"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {currentRound && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">当前轮次</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">第 {currentRound.round_number} 轮:</span>
                      <span className="font-medium">{currentRound.title}</span>
                      <Badge variant={ROUND_STATUS_VARIANT[currentRound.status] ?? "outline"}>
                        {ROUND_STATUS_LABEL[currentRound.status] ?? currentRound.status}
                      </Badge>
                    </div>
                    {currentRound.objective && <p className="text-muted-foreground">{currentRound.objective}</p>}
                    <span className="text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 inline mr-1" />
                      本轮时长: {currentRound.discussion_time} 分钟
                    </span>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="round-control" className="mt-0 space-y-6">
              {!currentRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">暂无轮次数据</CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">当前轮次信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">第 {currentRound.round_number} 轮: {currentRound.title}</span>
                        <Badge variant={ROUND_STATUS_VARIANT[currentRound.status] ?? "outline"}>
                          {ROUND_STATUS_LABEL[currentRound.status] ?? currentRound.status}
                        </Badge>
                      </div>
                      {currentRound.objective && <p className="text-sm text-muted-foreground">{currentRound.objective}</p>}
                      {workshop.status === "active" && (
                        <Button onClick={handleUnlockRound} disabled={unlocking} className="gap-2">
                          {unlocking ? <LoadingSpinner size="sm" /> : <Unlock className="h-4 w-4" />}
                          {currentRound.round_number < 4 ? "进入下一轮" : "结束研讨"}
                        </Button>
                      )}
                      {(currentRound.status === "active" || currentRound.status === "input") && (
                        <div className="flex flex-wrap items-center gap-3">
                          <Button onClick={handleStartTimer} disabled={startingTimer} className="gap-2">
                            {startingTimer ? <LoadingSpinner size="sm" /> : <Play className="h-4 w-4" />}
                            {currentRound.timer_started_at ? "重新开始计时" : "开始计时"}
                          </Button>
                          {currentRound.timer_remaining_seconds !== null && (
                            <span className="text-sm text-muted-foreground">
                              剩余 {Math.floor(currentRound.timer_remaining_seconds / 60)}:
                              {String(currentRound.timer_remaining_seconds % 60).padStart(2, "0")}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">计时设置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="max-w-xs space-y-2">
                        <Label htmlFor="round-time">本轮时长 (分钟)</Label>
                        <Input
                          id="round-time"
                          type="number"
                          min={1}
                          value={roundTime}
                          onChange={(event) => setRoundTime(event.target.value)}
                          placeholder="本轮时长"
                        />
                      </div>
                      <Button onClick={handleUpdateSettings} variant="outline" className="gap-2">
                        <Save className="h-4 w-4" />
                        保存设置
                      </Button>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="group-results" className="mt-0 space-y-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">选择轮次:</Label>
                  <Select value={selectedResultRound} onValueChange={setSelectedResultRound}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {workshop.rounds.map((round) => (
                        <SelectItem key={round.id} value={String(round.round_number)}>
                          第 {round.round_number} 轮: {round.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">选择小组:</Label>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {workshop.groups.map((group) => (
                        <SelectItem key={group.group_id} value={String(group.group_id)}>
                          第 {group.group_id} 组
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!selectedResultRoundInfo ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">暂无轮次数据</CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">问题与成员回答</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedResultRoundInfo.questions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">本轮暂无问题</p>
                      ) : (
                        selectedResultRoundInfo.questions.map((question, index) => {
                          const questionAnswers = answersForQuestion(selectedResultRoundInfo, question.id, selectedGroupId);
                          return (
                            <div key={question.id} className="rounded-md border p-3 space-y-2">
                              <p className="text-sm font-medium">Q{index + 1}: {question.content}</p>
                              {questionAnswers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">该组暂无回答</p>
                              ) : (
                                <div className="space-y-2">
                                  {questionAnswers.map((answer) => (
                                    <div key={answer.id} className="rounded-md bg-muted/30 p-2 text-sm">
                                      <div className="text-xs text-muted-foreground mb-1">
                                        {answer.participant_name ?? `成员 ${answer.participant_id}`} · {new Date(answer.created_at).toLocaleString("zh-CN")}
                                      </div>
                                      <div className="whitespace-pre-wrap">{answer.content}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>

                  {selectedResultRoundInfo.group_results
                    .filter((result) => result.group_id === selectedGroupId)
                    .map((result) => (
                      <Card key={result.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-base">
                              第 {selectedGroupId} 组 AI 提炼结果
                              <Badge className="ml-2" variant={result.status === "edited" ? "default" : result.status === "ready" ? "secondary" : "outline"}>
                                {resultStatusLabel(result.status)}
                              </Badge>
                            </CardTitle>
                            <Button size="sm" variant="outline" onClick={() => handleStartEditResult(result)} className="gap-1">
                              <Edit3 className="h-4 w-4" />
                              编辑最终结果
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {editingResultId === result.id ? (
                            <div className="space-y-3">
                              <Textarea
                                value={editingResultContent}
                                onChange={(event) => setEditingResultContent(event.target.value)}
                                rows={8}
                                className="font-mono text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveEditResult} className="gap-1">
                                  <Save className="h-4 w-4" />
                                  保存
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingResultId(null)} className="gap-1">
                                  <X className="h-4 w-4" />
                                  取消
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-medium">原始 AI 提炼结果</h4>
                                  {copyButton(result.original_content, `group-${result.id}-original`)}
                                </div>
                                <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                                  {result.original_content || "(空)"}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-medium">编辑后的 AI 提炼结果</h4>
                                  {copyButton(result.edited_content ?? result.original_content, `group-${result.id}-edited`)}
                                </div>
                                <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                                  {result.edited_content || "(未编辑)"}
                                </div>
                              </div>
                              {result.validation_error && (
                                <p className="text-sm text-destructive">失败原因: {result.validation_error}</p>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}

                  {selectedResultRoundInfo.group_results.filter((result) => result.group_id === selectedGroupId).length === 0 && (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">该组暂无 AI 结果</CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="synthesis" className="mt-0 space-y-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">选择轮次:</Label>
                  <Select value={selectedSynthesisRound} onValueChange={setSelectedSynthesisRound}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {workshop.rounds.map((round) => (
                        <SelectItem key={round.id} value={String(round.round_number)}>
                          第 {round.round_number} 轮: {round.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleTriggerSynthesis} disabled={synthesizing || !selectedSynthesisRoundInfo} className="gap-2">
                  {synthesizing ? <LoadingSpinner size="sm" /> : <Sparkles className="h-4 w-4" />}
                  综合提炼
                </Button>
              </div>

              {!selectedSynthesisRoundInfo ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">暂无轮次数据</CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">各组最终提交的 AI 提炼结果</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((groupId) => {
                        const result = selectedSynthesisRoundInfo.group_results.find((item) => item.group_id === groupId);
                        const content = result ? finalResultContent(result) : "";
                        return (
                          <div key={groupId} className="rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-medium">第 {groupId} 组</h4>
                              {result && copyButton(content, `synthesis-round-${selectedSynthesisRoundInfo.id}-group-${groupId}`)}
                            </div>
                            <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap font-mono min-h-24">
                              {content || "暂无提交结果"}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {selectedSynthesisRoundInfo.synthesis ? (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle className="text-base">
                            综合提炼结果
                            <Badge className="ml-2" variant={selectedSynthesisRoundInfo.synthesis.status === "edited" ? "default" : selectedSynthesisRoundInfo.synthesis.status === "ready" ? "secondary" : "outline"}>
                              {resultStatusLabel(selectedSynthesisRoundInfo.synthesis.status)}
                            </Badge>
                          </CardTitle>
                          <div className="flex gap-2">
                            {copyButton(
                              selectedSynthesisRoundInfo.synthesis.edited_content ?? selectedSynthesisRoundInfo.synthesis.original_content,
                              `synthesis-${selectedSynthesisRoundInfo.synthesis.id}`,
                            )}
                            <Button size="sm" variant="outline" onClick={handleStartEditSynthesis} className="gap-1">
                              <Edit3 className="h-4 w-4" />
                              编辑
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {editingSynthesis ? (
                          <div className="space-y-3">
                            <Textarea
                              value={synthesisEditContent}
                              onChange={(event) => setSynthesisEditContent(event.target.value)}
                              rows={12}
                              className="font-mono text-sm"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveEditSynthesis} className="gap-1">
                                <Save className="h-4 w-4" />
                                保存
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingSynthesis(false)} className="gap-1">
                                <X className="h-4 w-4" />
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                              {(selectedSynthesisRoundInfo.synthesis.edited_content ?? selectedSynthesisRoundInfo.synthesis.original_content) || "(空)"}
                            </div>
                            {selectedSynthesisRoundInfo.synthesis.validation_error && (
                              <p className="text-sm text-destructive">
                                失败原因: {selectedSynthesisRoundInfo.synthesis.validation_error}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>尚未生成综合提炼</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="host-input" className="mt-0 space-y-6">
              {!currentRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">暂无轮次数据</CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        主持人输入 - 第 {currentRound.round_number} 轮: {currentRound.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        在此输入线下共识的结果或补充信息，将合并到最终导出中。
                      </p>
                      <Textarea
                        value={hostInputContent}
                        onChange={(event) => setHostInputContent(event.target.value)}
                        rows={10}
                        placeholder="请输入内容..."
                        className="font-mono text-sm"
                      />
                      <Button onClick={handleSaveHostInput} disabled={savingHostInput} className="gap-2">
                        {savingHostInput ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
                        保存
                      </Button>
                      {currentRound.host_input && (
                        <p className="text-xs text-muted-foreground">
                          上次保存: {new Date(currentRound.host_input.updated_at).toLocaleString("zh-CN")}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">各轮主持人输入内容</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {workshop.rounds.map((round) => (
                        <div key={round.id} className="rounded-md border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">第 {round.round_number} 轮: {round.title}</h4>
                            {round.host_input && copyButton(round.host_input.content, `host-input-${round.id}`)}
                          </div>
                          <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap font-mono">
                            {round.host_input?.content || "暂无输入"}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="knowledge" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">上传文档</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" disabled={uploading} className="relative gap-2">
                      {uploading ? <LoadingSpinner size="sm" /> : <FileUp className="h-4 w-4" />}
                      {uploading ? "上传中..." : "选择文件"}
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        accept=".pdf,.docx,.doc,.txt,.md"
                      />
                    </Button>
                    <span className="text-xs text-muted-foreground">支持 PDF, DOCX, TXT, MD</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">文档列表</CardTitle>
                </CardHeader>
                <CardContent>
                  {workshop.knowledge_docs.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>暂无文档</p>
                      <p className="text-xs mt-1">上传文档以供 AI 参考</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-96">
                      <div className="space-y-2">
                        {workshop.knowledge_docs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{doc.original_filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(doc.file_size)} &middot; {doc.chunk_count} 分块 &middot; {new Date(doc.uploaded_at).toLocaleString("zh-CN")}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDoc(doc.id)}
                              disabled={deletingDocId === doc.id}
                              className="text-destructive hover:text-destructive shrink-0 ml-2"
                            >
                              {deletingDocId === doc.id ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="export" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">导出 Markdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    将所有轮次的内容、AI 分析结果、综合汇总和主持人输入导出为 Markdown 格式。
                  </p>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleExport} disabled={exporting} className="gap-2">
                      {exporting ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />}
                      {exporting ? "生成中..." : "生成并预览"}
                    </Button>
                    {exportData && (
                      <Button variant="outline" onClick={handleDownloadExport} className="gap-2">
                        <Download className="h-4 w-4" />
                        下载
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      导出预览
                    </DialogTitle>
                  </DialogHeader>
                  {exportData && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">文件名: {exportData.filename}</p>
                        <Button size="sm" onClick={handleDownloadExport} className="gap-1">
                          <Download className="h-4 w-4" />
                          下载
                        </Button>
                      </div>
                      <ScrollArea className="h-[50vh] rounded-md border">
                        <pre className="p-4 text-sm whitespace-pre-wrap font-mono">{exportData.markdown}</pre>
                      </ScrollArea>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
