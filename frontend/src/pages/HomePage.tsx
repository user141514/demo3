import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Users, UserCog, ArrowRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";
import { workshopApi } from "@/services/api";
import type { WorkshopCreateResponse } from "@/types";

export function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Host state
  const [hostName, setHostName] = useState("");
  const [workshopTitle, setWorkshopTitle] = useState("领导力共创研讨会");
  const [created, setCreated] = useState<WorkshopCreateResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Member state
  const [memberName, setMemberName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const handleCreate = async () => {
    if (!hostName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const w = await workshopApi.create(workshopTitle || "领导力共创研讨会", hostName);
      setCreated(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!memberName.trim() || !inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const valid = await workshopApi.validateInvite(inviteCode.trim());
      if (!valid.valid || !valid.workshop_id) {
        setError("邀请码无效或研讨会已结束");
        setLoading(false);
        return;
      }
      const p = await workshopApi.join(valid.workshop_id, memberName.trim(), inviteCode.trim());
      sessionStorage.setItem("participant", JSON.stringify(p));
      navigate(`/workshop/${valid.workshop_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失败");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const enterHost = () => {
    if (created) {
      navigate(`/workshop/${created.id}/host?code=${created.host_code}`);
    }
  };

  const enterKB = () => {
    if (created) {
      navigate(`/knowledge?admin=${created.kb_admin_code}&workshop=${created.id}`);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" /> AI 驱动的领导力共创
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">领导力共创研讨会</h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            主持人控流 · 四组隔离 · AI 提炼 · 知识库增强 · 完整导出
          </p>
        </div>

        {/* Created workshop info */}
        {created ? (
          <Card className="w-full max-w-lg">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold text-lg text-center">研讨会已创建</h3>
              <div className="space-y-3">
                {[
                  { label: "成员邀请码", value: created.invite_code },
                  { label: "主持人码", value: created.host_code },
                  { label: "知识库管理码", value: created.kb_admin_code },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                    <span className="text-sm font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <code className="text-lg font-bold tracking-wider">{value}</code>
                      <Button variant="ghost" size="icon" onClick={() => copyCode(value, label)}>
                        {copied === label ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={enterHost}>
                  <UserCog className="h-4 w-4 mr-2" /> 进入主持人后台
                </Button>
                <Button variant="outline" onClick={enterKB}>
                  知识库管理
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="host" className="w-full max-w-lg">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="host"><UserCog className="h-4 w-4 mr-2" />主持人入口</TabsTrigger>
              <TabsTrigger value="member"><Users className="h-4 w-4 mr-2" />成员入口</TabsTrigger>
            </TabsList>

            <TabsContent value="host">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hostName">主持人姓名</Label>
                    <Input id="hostName" value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="请输入您的姓名" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">研讨会标题</Label>
                    <Input id="title" value={workshopTitle} onChange={(e) => setWorkshopTitle(e.target.value)} placeholder="领导力共创研讨会" />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="w-full" size="lg" onClick={handleCreate} disabled={loading || !hostName.trim()}>
                    {loading ? <LoadingSpinner size="sm" /> : <>创建研讨会 <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="member">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="memberName">您的姓名</Label>
                    <Input id="memberName" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="请输入您的姓名" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inviteCode">邀请码</Label>
                    <Input id="inviteCode" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="请输入6位邀请码" maxLength={6} className="font-mono text-lg tracking-widest" />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="w-full" size="lg" onClick={handleJoin} disabled={loading || !memberName.trim() || inviteCode.length < 6}>
                    {loading ? <LoadingSpinner size="sm" /> : <>加入研讨会 <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Flow overview */}
      <div className="border-t bg-muted/30 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-xl font-semibold text-center mb-8">四轮共创流程</h2>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { step: "1", title: "维度构建", desc: "各组提炼5-8个领导力维度" },
              { step: "2", title: "层级定义", desc: "维度×管理层级差异化定位" },
              { step: "3", title: "行为动作", desc: "可观察可考核的具体行为" },
              { step: "4", title: "应用场景", desc: "落地应用建议收集" },
            ].map((item) => (
              <Card key={item.step} className="text-center">
                <CardContent className="p-4">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mx-auto mb-2">{item.step}</div>
                  <h4 className="font-medium text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
