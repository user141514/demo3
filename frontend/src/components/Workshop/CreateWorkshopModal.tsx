import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";

interface CreateWorkshopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string) => Promise<void>;
}

export function CreateWorkshopModal({
  open,
  onOpenChange,
  onCreate,
}: CreateWorkshopModalProps) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("请输入工作坊标题");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setTitle("");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "创建失败，请重试"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建工作坊</DialogTitle>
          <DialogDescription>
            输入工作坊标题，开启领导力模型共建之旅。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="workshop-title">工作坊标题</Label>
            <Input
              id="workshop-title"
              placeholder="例如：2026年度领导力模型共建"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              maxLength={100}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !title.trim()}>
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : (
              "创建"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
