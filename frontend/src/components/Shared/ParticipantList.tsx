import { Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Participant } from "@/types";

interface ParticipantListProps {
  participants: Participant[];
}

export function ParticipantList({ participants }: ParticipantListProps) {
  if (participants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mb-2" />
        <p className="text-sm">暂无参与者</p>
        <p className="text-xs">等待参与者加入...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          参与者 ({participants.length})
        </span>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {participants.map((p, index) => (
            <div key={p.id}>
              <div className="flex items-center justify-between py-2 px-1 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {p.name.charAt(0)}
                  </div>
                  <span className="text-sm">{p.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.is_group_leader ? "组长" : `第 ${p.group_id} 组`}
                </span>
              </div>
              {index < participants.length - 1 && (
                <Separator className="my-0.5" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
