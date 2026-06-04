interface RoundHeaderProps {
  roundNumber: number;
  title: string;
  objective: string;
}

export function RoundHeader({
  roundNumber,
  title,
  objective,
}: RoundHeaderProps) {
  return (
    <div className="mb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
        第 {roundNumber} 轮
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground">{objective}</p>
    </div>
  );
}
