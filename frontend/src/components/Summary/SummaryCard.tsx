import { useState } from "react";
import { FileText, Edit3, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Summary } from "@/types";

interface SummaryCardProps {
  summary: Summary | null;
  loading?: boolean;
  onSave?: (content: string) => Promise<void>;
}

export function SummaryCard({
  summary,
  loading = false,
  onSave,
}: SummaryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleStartEdit = () => {
    setEditContent(summary?.content || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(editContent);
      setEditing(false);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            AI 汇总
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-4/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            AI 汇总
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            暂未生成汇总
          </p>
          <p className="text-xs text-muted-foreground text-center">
            点击"AI汇总"按钮生成智能总结
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            AI 汇总
          </CardTitle>
          <div className="flex gap-1">
            {editing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-7 gap-1"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "保存中..." : "保存"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                className="h-7 gap-1"
              >
                <Edit3 className="h-3.5 w-3.5" />
                编辑
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">
        {editing ? (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[200px] text-sm"
          />
        ) : (
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {summary.content}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
