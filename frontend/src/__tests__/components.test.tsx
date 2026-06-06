import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// ── Import real components ──────────────────────────────────────────────────
import { QuestionCard } from "@/components/Questions/QuestionCard";
import { AnswerBubble } from "@/components/Questions/AnswerBubble";
import { AnswerInput } from "@/components/Questions/AnswerInput";
import { RoundProgress } from "@/components/Round/RoundProgress";
import { RoundHeader } from "@/components/Round/RoundHeader";
import { ParticipantList } from "@/components/Shared/ParticipantList";
import { LoadingSpinner } from "@/components/Shared/LoadingSpinner";
import { SummarizeButton } from "@/components/Summary/SummarizeButton";

function wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe("QuestionCard", () => {
  it("renders question content", () => {
    render(
      <QuestionCard question={{ id: 1, round_id: 1, content: "什么是好的领导力？", order: 1 }} />,
      { wrapper }
    );
    expect(screen.getByText("什么是好的领导力？")).toBeInTheDocument();
  });

  it("shows AI sparkle icon", () => {
    const { container } = render(
      <QuestionCard question={{ id: 2, round_id: 1, content: "测试问题", order: 2 }} />,
      { wrapper }
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });
});

describe("AnswerBubble", () => {
  it("renders participant name and content", () => {
    render(
      <AnswerBubble
        answer={{
          id: 1,
          question_id: 1,
          participant_id: 1,
          participant_name: "张三",
          participant_role: "senior",
          content: "要有战略眼光",
          created_at: new Date().toISOString(),
        }}
      />,
      { wrapper }
    );
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("要有战略眼光")).toBeInTheDocument();
  });

  it("shows '匿名' when participant_name is missing", () => {
    render(
      <AnswerBubble
        answer={{
          id: 2,
          question_id: 1,
          participant_id: 2,
          participant_name: undefined,
          participant_role: undefined,
          content: "匿名意见",
          created_at: new Date().toISOString(),
        }}
      />,
      { wrapper }
    );
    expect(screen.getByText("匿名")).toBeInTheDocument();
  });
});

describe("AnswerInput", () => {
  it("renders textarea and submit button", () => {
    render(
      <AnswerInput questionId={1} participantId={1} onSubmit={vi.fn()} />,
      { wrapper }
    );
    expect(screen.getByPlaceholderText(/回答/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onSubmit with questionId and content", () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(
      <AnswerInput questionId={5} participantId={10} onSubmit={onSubmit} />,
      { wrapper }
    );
    const textarea = screen.getByPlaceholderText(/回答/);
    fireEvent.change(textarea, { target: { value: "我的看法" } });
    fireEvent.click(screen.getByRole("button"));
    expect(onSubmit).toHaveBeenCalledWith(5, 10, "我的看法");
  });

  it("disables button when disabled prop is true", () => {
    render(
      <AnswerInput questionId={1} participantId={1} onSubmit={vi.fn()} disabled />,
      { wrapper }
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("clears textarea after submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(
      <AnswerInput questionId={1} participantId={1} onSubmit={onSubmit} />,
      { wrapper }
    );
    const textarea = screen.getByPlaceholderText(/回答/);
    fireEvent.change(textarea, { target: { value: "回答内容" } });
    fireEvent.click(screen.getByRole("button"));
    await vi.waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });
});

describe("RoundProgress", () => {
  const rounds = [
    { number: 1, title: "领导力认知" },
    { number: 2, title: "层级定义" },
    { number: 3, title: "行为分布" },
    { number: 4, title: "模型应用" },
  ];

  it("renders all 4 rounds", () => {
    render(
      <RoundProgress currentRound={1} onNextRound={vi.fn()} rounds={rounds} />,
      { wrapper }
    );
    expect(screen.getByText("领导力认知")).toBeInTheDocument();
    expect(screen.getByText("层级定义")).toBeInTheDocument();
    expect(screen.getByText("行为分布")).toBeInTheDocument();
    expect(screen.getByText("模型应用")).toBeInTheDocument();
  });

  it("shows '当前轮次' for active round", () => {
    render(
      <RoundProgress currentRound={2} onNextRound={vi.fn()} rounds={rounds} />,
      { wrapper }
    );
    expect(screen.getByText("当前轮次")).toBeInTheDocument();
  });

  it("shows '下一轮' button when not last round", () => {
    render(
      <RoundProgress currentRound={1} onNextRound={vi.fn()} rounds={rounds} />,
      { wrapper }
    );
    expect(screen.getByText("下一轮")).toBeInTheDocument();
  });

  it("shows '最后一轮' when on round 4", () => {
    render(
      <RoundProgress currentRound={4} onNextRound={vi.fn()} rounds={rounds} isLastRound />,
      { wrapper }
    );
    expect(screen.getByText("最后一轮")).toBeInTheDocument();
  });

  it("calls onNextRound when clicked", () => {
    const onNext = vi.fn();
    render(
      <RoundProgress currentRound={1} onNextRound={onNext} rounds={rounds} />,
      { wrapper }
    );
    fireEvent.click(screen.getByText("下一轮"));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("RoundHeader", () => {
  it("renders round number, title and objective", () => {
    render(
      <RoundHeader roundNumber={1} title="领导力认知" objective="共建公司领导力核心维度" />,
      { wrapper }
    );
    expect(screen.getByText("第 1 轮")).toBeInTheDocument();
    expect(screen.getByText("领导力认知")).toBeInTheDocument();
    expect(screen.getByText("共建公司领导力核心维度")).toBeInTheDocument();
  });
});

describe("ParticipantList", () => {
  it("renders participant names with role badges", () => {
    const participants = [
      { id: 1, workshop_id: 1, name: "张总", role: "senior" as const },
      { id: 2, workshop_id: 1, name: "李经理", role: "middle" as const },
    ];
    render(<ParticipantList participants={participants} />, { wrapper });
    expect(screen.getByText("张总")).toBeInTheDocument();
    expect(screen.getByText("李经理")).toBeInTheDocument();
  });

  it("shows participant count", () => {
    const participants = [{ id: 1, workshop_id: 1, name: "张总", role: "senior" as const }];
    render(<ParticipantList participants={participants} />, { wrapper });
    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it("renders empty state when no participants", () => {
    render(<ParticipantList participants={[]} />, { wrapper });
    expect(screen.getByText(/暂无/)).toBeInTheDocument();
  });
});

describe("LoadingSpinner", () => {
  it("renders spinner with text", () => {
    render(<LoadingSpinner text="加载中..." />);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("renders without text", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});

describe("SummarizeButton", () => {
  it("renders button and calls onSummarize", () => {
    const onSummarize = vi.fn().mockResolvedValue({ id: 1, content: "S" });
    render(<SummarizeButton roundId={10} onSummarize={onSummarize} />, { wrapper });
    fireEvent.click(screen.getByRole("button"));
    expect(onSummarize).toHaveBeenCalledWith(10);
  });

  it("disables when roundId is 0", () => {
    render(<SummarizeButton roundId={0} onSummarize={vi.fn()} disabled />, { wrapper });
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
