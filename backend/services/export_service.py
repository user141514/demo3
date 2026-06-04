import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Workshop, Participant, Round, Question, Answer,
    GroupRoundResult, SynthesisResult, HostInput, KnowledgeDocument,
)

logger = logging.getLogger(__name__)


class ExportService:

    def __init__(self, db: AsyncSession):
        self._db = db

    async def generate_markdown(self, workshop_id: int) -> str:
        workshop = await self._load_workshop(workshop_id)
        if not workshop:
            raise ValueError(f"Workshop {workshop_id} not found")

        lines = [
            f"# {workshop.title} — 领导力共创研讨会完整记录",
            "",
            f"**主持人**: {workshop.host_name}",
            f"**邀请码**: {workshop.invite_code}",
            f"**创建时间**: {workshop.created_at.strftime('%Y-%m-%d %H:%M')}",
            f"**状态**: {'进行中' if workshop.status.value == 'active' else '已完成'}",
            f"**总轮次**: {len(workshop.rounds)}",
            "",
        ]

        # Participants
        groups = {1: [], 2: [], 3: [], 4: []}
        for p in workshop.participants:
            groups.setdefault(p.group_id, []).append(p)
        lines.append("## 参会人员")
        for gid in sorted(groups):
            lines.append(f"### 第{gid}组 ({len(groups[gid])}人)")
            for p in groups[gid]:
                leader = " (组长)" if p.is_group_leader else ""
                lines.append(f"- {p.name}{leader}")
            lines.append("")
        lines.append("---\n")

        # Rounds
        for rd in sorted(workshop.rounds, key=lambda r: r.round_number):
            lines.append(f"# 讨论{self._cn_num(rd.round_number)}：{rd.title}")
            lines.append(f"**目标**: {rd.objective or '无'}")
            lines.append(f"**讨论时间**: {rd.discussion_time} 分钟 | **填写时间**: {rd.input_time} 分钟")
            lines.append("")

            # Questions
            for q in rd.questions:
                lines.append(f"**Q{q.order}**: {q.content}")
            lines.append("")

            # Group answers
            for gid in sorted(groups):
                lines.append(f"## 第{gid}组回答")
                for q in rd.questions:
                    answers = [a for a in q.answers if a.participant and a.participant.group_id == gid]
                    if answers:
                        lines.append(f"### {q.content}")
                        for a in answers:
                            name = a.participant.name if a.participant else "未知"
                            lines.append(f"- **{name}**: {a.content}")
                        lines.append("")
                if not any(a for q in rd.questions for a in q.answers if a.participant and a.participant.group_id == gid):
                    lines.append("（本组未提交回答）\n")

            # Group AI results
            for gr in rd.group_results:
                lines.append(f"## 第{gr.group_id}组 AI 生成结果")
                if gr.original_content:
                    lines.append(gr.original_content)
                if gr.edited_content and gr.edited_content != gr.original_content:
                    lines.append(f"### 编辑后版本")
                    lines.append(gr.edited_content)
                lines.append("")

            # Synthesis
            for sr in rd.synthesis_results:
                lines.append("## AI 综合四组结果")
                if sr.original_content:
                    lines.append(sr.original_content)
                if sr.edited_content and sr.edited_content != sr.original_content:
                    lines.append("### 编辑后版本")
                    lines.append(sr.edited_content)
                lines.append("")

            # Host input
            for hi in rd.host_inputs:
                lines.append("## 主持人输入")
                lines.append(hi.content)
                lines.append("")

            lines.append("---\n")

        # Knowledge base summary
        docs = [d for d in workshop.knowledge_docs if not d.is_deleted]
        if docs:
            lines.append("## 知识库文件清单")
            for d in docs:
                lines.append(f"- {d.original_filename} ({d.file_size} bytes, {d.chunk_count} chunks, {d.embedding_model})")
            lines.append("")

        tz = datetime.now(timezone.utc).astimezone()
        lines.append(f"---\n*导出时间: {tz.strftime('%Y-%m-%d %H:%M:%S')}*")
        return "\n".join(lines)

    async def _load_workshop(self, workshop_id: int):
        result = await self._db.execute(
            select(Workshop)
            .options(
                selectinload(Workshop.participants),
                selectinload(Workshop.rounds)
                .selectinload(Round.questions)
                .selectinload(Question.answers)
                .selectinload(Answer.participant),
                selectinload(Workshop.rounds)
                .selectinload(Round.group_results),
                selectinload(Workshop.rounds)
                .selectinload(Round.synthesis_results),
                selectinload(Workshop.rounds)
                .selectinload(Round.host_inputs),
                selectinload(Workshop.knowledge_docs),
            )
            .where(Workshop.id == workshop_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _cn_num(n: int) -> str:
        return ["零", "一", "二", "三", "四"][n] if 0 <= n <= 4 else str(n)
