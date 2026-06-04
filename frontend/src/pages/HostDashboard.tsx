import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { useWorkshopHost } from "@/hooks/useWorkshopHost";
import { useWebSocket } from "@/hooks/useWebSocket";
import { knowledgeApi } from "@/services/api";
import {
  Users, Clock, Unlock, Edit3, Save, Download,
  FileUp, Trash2, RefreshCw, X, Eye, EyeOff,
  AlertTriangle, FileText, Sparkles, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";
import type { WSMessage, GroupRoundResult, SynthesisResult, HostInput } from "@/types";

const ROUND_STATUS_LABEL: Record<string, string> = {
  locked: "已锁定",
  active: "讨论中",
  input: "输入中",
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

export function HostDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const workshopId = id ? parseInt(id, 10) : null;
  const hostCode = searchParams.get("code");

  const {
    workshop, loading, error,
    fetchHost, unlockRound, updateRoundSettings,
    submitHostInput, editGroupResult, editSynthesis,
    triggerSynthesis, exportMarkdown,
  } = useWorkshopHost(workshopId, hostCode);

  // ── Tab ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");

  // ── Group results ────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState("1");
  const [editingResultId, setEditingResultId] = useState<number | null>(null);
  const [editingResultContent, setEditingResultContent] = useState("");
  const [showOriginalResult, setShowOriginalResult] = useState(false);

  // ── Synthesis ────────────────────────────────────────────────────────
  const [editingSynthesis, setEditingSynthesis] = useState(false);
  const [synthesisEditContent, setSynthesisEditContent] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);

  // ── Round control ────────────────────────────────────────────────────
  const [discussionTime, setDiscussionTime] = useState("");
  const [inputTime, setInputTime] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // ── Host input ───────────────────────────────────────────────────────
  const [hostInputContent, setHostInputContent] = useState("");
  const [savingHostInput, setSavingHostInput] = useState(false);

  // ── Knowledge ────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);

  // ── Export ───────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<{ markdown: string; filename: string } | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // ── Local errors ─────────────────────────────────────────────────────
  const [localError, setLocalError] = useState<string | null>(null);

  // ── Sync local timer fields when workshop loads ──────────────────────
  useEffect(() => {
    if (!workshop || workshop.rounds.length === 0) return;
    const cur = workshop.current_round - 1;
    const r = workshop.rounds[cur];
    if (r) {
      setDiscussionTime(String(r.discussion_time ?? ""));
      setInputTime(String(r.input_time ?? ""));
    }
  }, [workshop?.current_round, workshop?.rounds]);

  // ── Sync host input when round changes ──────────────────────────────
  useEffect(() => {
    if (!workshop || workshop.rounds.length === 0) return;
    const cur = workshop.current_round - 1;
    const r = workshop.rounds[cur];
    if (r?.host_input) {
      setHostInputContent(r.host_input.content);
    } else {
      setHostInputContent("");
    }
  }, [workshop?.current_round, workshop?.rounds]);

  // ── WebSocket handler ────────────────────────────────────────────────
  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (["result_ready", "synthesis_ready", "round_changed", "new_answer"].includes(msg.type)) {
      fetchHost();
    }
  }, [fetchHost]);

  useWebSocket({
    workshopId,
    channel: "host",
    onMessage: handleWSMessage,
    enabled: !!workshopId && !!hostCode,
  });

  // ── Helpers ──────────────────────────────────────────────────────────
  const currentRound = workshop?.rounds[Math.max(0, (workshop?.current_round ?? 1) - 1)] ?? null;

  const clearLocalError = () => setLocalError(null);

  // ── Round control handlers ───────────────────────────────────────────
  const handleUnlockRound = async () => {
    setUnlocking(true);
    clearLocalError();
    const result = await unlockRound();
    if (!result) setLocalError("解锁轮次失败，请重试");
    setUnlocking(false);
  };

  const handleUpdateSettings = async () => {
    clearLocalError();
    const dt = discussionTime ? parseInt(discussionTime, 10) : undefined;
    const it = inputTime ? parseInt(inputTime, 10) : undefined;
    const result = await updateRoundSettings(dt, it);
    if (!result) setLocalError("更新设置失败，请重试");
  };

  // ── Group results handlers ───────────────────────────────────────────
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

  const handleCancelEditResult = () => {
    setEditingResultId(null);
    setEditingResultContent("");
  };

  // ── Synthesis handlers ───────────────────────────────────────────────
  const handleTriggerSynthesis = async () => {
    if (!currentRound) return;
    setSynthesizing(true);
    clearLocalError();
    const result = await triggerSynthesis(currentRound.id);
    if (!result) setLocalError("综合失败，请重试");
    setSynthesizing(false);
  };

  const handleStartEditSynthesis = () => {
    if (!currentRound?.synthesis) return;
    setSynthesisEditContent(
      currentRound.synthesis.edited_content ?? currentRound.synthesis.original_content ?? "",
    );
    setEditingSynthesis(true);
  };

  const handleSaveEditSynthesis = async () => {
    if (!currentRound) return;
    clearLocalError();
    const result = await editSynthesis(currentRound.id, synthesisEditContent);
    if (result) {
      setEditingSynthesis(false);
      fetchHost();
    } else {
      setLocalError("保存综合编辑失败");
    }
  };

  const handleCancelEditSynthesis = () => {
    setEditingSynthesis(false);
    setSynthesisEditContent("");
  };

  // ── Host input handler ───────────────────────────────────────────────
  const handleSaveHostInput = async () => {
    if (!currentRound) return;
    setSavingHostInput(true);
    clearLocalError();
    const result = await submitHostInput(currentRound.id, hostInputContent);
    if (!result) setLocalError("保存主持人输入失败");
    setSavingHostInput(false);
  };

  // ── Knowledge handlers ───────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
        const result = await knowledgeApi.upload(
          file.name,
          base64,
          file.type || "application/octet-stream",
          workshop.id,
          workshop.kb_admin_code,
        );
        if (result) fetchHost();
        setUploading(false);
      };
      reader.onerror = () => {
        setLocalError("文件读取失败");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "上传失败");
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!workshop) return;
    setDeletingDocId(docId);
    clearLocalError();
    try {
      await knowledgeApi.delete(docId, workshop.id, workshop.kb_admin_code);
      fetchHost();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "删除失败");
    }
    setDeletingDocId(null);
  };

  // ── Export handler ───────────────────────────────────────────────────
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
    const a = document.createElement("a");
    a.href = url;
    a.download = exportData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Get display content for a result ──────────────────────────────────
  const getResultContent = (r: GroupRoundResult) => {
    if (showOriginalResult) return r.original_content ?? "";
    return r.edited_content ?? r.original_content ?? "";
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (loading && !workshop) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <LoadingSpinner size="lg" text="加载主持人面板..." />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
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

  // ── Not found state ────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────
  const currentRoundIndex = workshop.current_round - 1;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{workshop.title}</h1>
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

      {/* Local error banner */}
      {localError && (
        <div className="bg-destructive/10 text-destructive text-sm px-6 py-2 flex items-center justify-between">
          <span>{localError}</span>
          <Button variant="ghost" size="sm" onClick={clearLocalError}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b px-6">
          <TabsList className="h-12 flex-wrap">
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
            {/* ────────── TAB: 总览 ────────── */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* Workshop info */}
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
                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">
                      {workshop.invite_code}
                    </code>
                  </div>
                  <div>
                    <p className="text-muted-foreground">主持人码</p>
                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">
                      {workshop.host_code}
                    </code>
                  </div>
                  <div>
                    <p className="text-muted-foreground">创建时间</p>
                    <p className="font-medium">
                      {new Date(workshop.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Group cards */}
              <div>
                <h3 className="text-base font-semibold mb-3">分组概览</h3>
                {workshop.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无分组数据</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {workshop.groups.map((g) => (
                      <Card key={g.group_id}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                            {g.group_id}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold">第 {g.group_id} 组</p>
                            <p className="text-sm text-muted-foreground">
                              <Users className="h-3.5 w-3.5 inline mr-1" />
                              {g.participant_count} 人
                            </p>
                            {g.leader_name ? (
                              <p className="text-sm text-muted-foreground">
                                组长: {g.leader_name}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">暂无组长</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Current round status */}
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
                    {currentRound.objective && (
                      <p className="text-muted-foreground">{currentRound.objective}</p>
                    )}
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 inline mr-1" />
                        讨论: {currentRound.discussion_time}分
                      </span>
                      <span className="text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 inline mr-1" />
                        输入: {currentRound.input_time}分
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ────────── TAB: 轮次管理 ────────── */}
            <TabsContent value="round-control" className="mt-0 space-y-6">
              {!currentRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    暂无轮次数据
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">当前轮次信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          第 {currentRound.round_number} 轮: {currentRound.title}
                        </span>
                        <Badge variant={ROUND_STATUS_VARIANT[currentRound.status] ?? "outline"}>
                          {ROUND_STATUS_LABEL[currentRound.status] ?? currentRound.status}
                        </Badge>
                      </div>
                      {currentRound.objective && (
                        <p className="text-sm text-muted-foreground">{currentRound.objective}</p>
                      )}
                      {currentRound.status === "locked" && workshop.current_round <= 4 && (
                        <Button
                          onClick={handleUnlockRound}
                          disabled={unlocking}
                          className="gap-2"
                        >
                          {unlocking ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                          解锁下一轮
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">计时设置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="discussion-time">讨论时间 (分钟)</Label>
                          <Input
                            id="discussion-time"
                            type="number"
                            min={1}
                            value={discussionTime}
                            onChange={(e) => setDiscussionTime(e.target.value)}
                            placeholder="讨论时间"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="input-time">输入时间 (分钟)</Label>
                          <Input
                            id="input-time"
                            type="number"
                            min={1}
                            value={inputTime}
                            onChange={(e) => setInputTime(e.target.value)}
                            placeholder="输入时间"
                          />
                        </div>
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

            {/* ────────── TAB: 各组成果 ────────── */}
            <TabsContent value="group-results" className="mt-0 space-y-6">
              {workshop.groups.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    暂无分组数据
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="shrink-0">选择小组:</Label>
                      <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {workshop.groups.map((g) => (
                            <SelectItem key={g.group_id} value={String(g.group_id)}>
                              第 {g.group_id} 组
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={showOriginalResult ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowOriginalResult(!showOriginalResult)}
                        className="gap-1"
                      >
                        {showOriginalResult ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {showOriginalResult ? "查看原始" : "查看编辑"}
                      </Button>
                    </div>
                  </div>

                  {currentRound && (
                    <div className="space-y-4">
                      {/* Questions */}
                      {currentRound.questions.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">本轮问题</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {currentRound.questions.map((q, idx) => (
                              <div key={q.id} className="text-sm">
                                <span className="font-medium text-muted-foreground">Q{idx + 1}:</span> {q.content}
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Group results */}
                      {(() => {
                        const groupIdNum = parseInt(selectedGroup, 10);
                        const results = currentRound.group_results.filter(
                          (r) => r.group_id === groupIdNum,
                        );
                        if (results.length === 0) {
                          return (
                            <Card>
                              <CardContent className="p-8 text-center text-muted-foreground">
                                该组暂无 AI 结果
                              </CardContent>
                            </Card>
                          );
                        }
                        return results.map((result) => (
                          <Card key={result.id}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                  AI 分析结果
                                  <Badge className="ml-2" variant={
                                    result.status === "edited" ? "default" :
                                    result.status === "ready" ? "secondary" : "outline"
                                  }>
                                    {result.status === "edited" ? "已编辑" :
                                     result.status === "ready" ? "已就绪" :
                                     result.status === "processing" ? "处理中" :
                                     result.status === "validation_failed" ? "验证失败" : "待处理"}
                                  </Badge>
                                </CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {editingResultId === result.id ? (
                                <div className="space-y-3">
                                  <Textarea
                                    value={editingResultContent}
                                    onChange={(e) => setEditingResultContent(e.target.value)}
                                    rows={8}
                                    className="font-mono text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={handleSaveEditResult} className="gap-1">
                                      <Save className="h-4 w-4" />
                                      保存
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleCancelEditResult} className="gap-1">
                                      <X className="h-4 w-4" />
                                      取消
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                                    {getResultContent(result) || "(空)"}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStartEditResult(result)}
                                    className="gap-1"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                    编辑
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ));
                      })()}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ────────── TAB: 综合汇总 ────────── */}
            <TabsContent value="synthesis" className="mt-0 space-y-6">
              {!currentRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    暂无轮次数据
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTriggerSynthesis}
                      disabled={synthesizing}
                      className="gap-2"
                    >
                      {synthesizing ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      综合四组
                    </Button>
                    {currentRound.status === "locked" && (
                      <p className="text-sm text-muted-foreground">请先解锁轮次</p>
                    )}
                  </div>

                  {currentRound.synthesis ? (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            综合汇总结果
                            <Badge className="ml-2" variant={
                              currentRound.synthesis.status === "edited" ? "default" :
                              currentRound.synthesis.status === "ready" ? "secondary" : "outline"
                            }>
                              {currentRound.synthesis.status === "edited" ? "已编辑" :
                               currentRound.synthesis.status === "ready" ? "已就绪" :
                               currentRound.synthesis.status === "processing" ? "处理中" : "待处理"}
                            </Badge>
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {editingSynthesis ? (
                          <div className="space-y-3">
                            <Textarea
                              value={synthesisEditContent}
                              onChange={(e) => setSynthesisEditContent(e.target.value)}
                              rows={12}
                              className="font-mono text-sm"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveEditSynthesis} className="gap-1">
                                <Save className="h-4 w-4" />
                                保存
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelEditSynthesis} className="gap-1">
                                <X className="h-4 w-4" />
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                              {(showOriginalResult
                                ? currentRound.synthesis.original_content
                                : currentRound.synthesis.edited_content ?? currentRound.synthesis.original_content
                              ) || "(空)"}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleStartEditSynthesis}
                              className="gap-1"
                            >
                              <Edit3 className="h-4 w-4" />
                              编辑
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>尚未生成综合汇总</p>
                        <p className="text-xs mt-1">点击"综合四组"按钮触发 AI 综合</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* ────────── TAB: 主持人输入 ────────── */}
            <TabsContent value="host-input" className="mt-0 space-y-6">
              {!currentRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    暂无轮次数据
                  </CardContent>
                </Card>
              ) : (
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
                      onChange={(e) => setHostInputContent(e.target.value)}
                      rows={10}
                      placeholder="请输入内容..."
                      className="font-mono text-sm"
                    />
                    <Button
                      onClick={handleSaveHostInput}
                      disabled={savingHostInput}
                      className="gap-2"
                    >
                      {savingHostInput ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      保存
                    </Button>
                    {currentRound.host_input && (
                      <p className="text-xs text-muted-foreground">
                        上次保存: {new Date(currentRound.host_input.updated_at).toLocaleString("zh-CN")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ────────── TAB: 知识库 ────────── */}
            <TabsContent value="knowledge" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">上传文档</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" disabled={uploading} className="relative gap-2">
                      {uploading ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                      {uploading ? "上传中..." : "选择文件"}
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        accept=".pdf,.docx,.doc,.txt,.md"
                      />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      支持 PDF, DOCX, TXT, MD
                    </span>
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
                          <div
                            key={doc.id}
                            className="flex items-center justify-between bg-muted/30 rounded-lg p-3 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{doc.original_filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(doc.file_size)} &middot;
                                {doc.chunk_count} 分块 &middot;
                                {new Date(doc.uploaded_at).toLocaleString("zh-CN")}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDoc(doc.id)}
                              disabled={deletingDocId === doc.id}
                              className="text-destructive hover:text-destructive shrink-0 ml-2"
                            >
                              {deletingDocId === doc.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ────────── TAB: 导出 ────────── */}
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
                    <Button
                      onClick={handleExport}
                      disabled={exporting}
                      className="gap-2"
                    >
                      {exporting ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {exporting ? "生成中..." : "生成并预览"}
                    </Button>
                    {exportData && (
                      <Button
                        variant="outline"
                        onClick={handleDownloadExport}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        下载
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Export preview */}
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
                        <p className="text-sm text-muted-foreground">
                          文件名: {exportData.filename}
                        </p>
                        <Button size="sm" onClick={handleDownloadExport} className="gap-1">
                          <Download className="h-4 w-4" />
                          下载
                        </Button>
                      </div>
                      <ScrollArea className="h-[50vh] rounded-md border">
                        <pre className="p-4 text-sm whitespace-pre-wrap font-mono">
                          {exportData.markdown}
                        </pre>
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
