import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";

interface JoinWorkshopFormProps {
  onJoin: (workshopId: number, name: string, role: string) => Promise<void>;
}

export function JoinWorkshopForm({ onJoin }: JoinWorkshopFormProps) {
  const [workshopId, setWorkshopId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(workshopId, 10);
    if (!id || isNaN(id)) {
      setError("请输入有效的工作坊ID");
      return;
    }
    if (!name.trim()) {
      setError("请输入您的姓名");
      return;
    }
    if (!role) {
      setError("请选择您的角色");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onJoin(id, name.trim(), role);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "加入失败，请重试"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-base">加入工作坊</h3>
          <div className="space-y-2">
            <Label htmlFor="workshop-id">工作坊ID</Label>
            <Input
              id="workshop-id"
              type="number"
              placeholder="输入工作坊编号"
              value={workshopId}
              onChange={(e) => {
                setWorkshopId(e.target.value);
                setError(null);
              }}
              disabled={loading}
              min={1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="participant-name">您的姓名</Label>
            <Input
              id="participant-name"
              placeholder="输入您的姓名"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              disabled={loading}
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">您的角色</Label>
            <Select
              value={role}
              onValueChange={(v: string) => {
                setRole(v);
                setError(null);
              }}
              disabled={loading}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="选择管理层级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="senior">高管</SelectItem>
                <SelectItem value="middle">中层管理者</SelectItem>
                <SelectItem value="junior">基层管理者</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : (
              "加入工作坊"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
