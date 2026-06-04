"""
Seed data for leadership workshop: 4 rounds of group discussion questions.
Run with: python seed.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import async_session_factory, init_db
from models import Workshop, Round, Question, RoundStatus

ROUNDS_DATA = [
    {
        "round_number": 1,
        "title": "讨论一：领导力维度构建",
        "objective": "各小组讨论并提炼公司核心领导力维度（5-8个），AI 将基于各组回答生成维度并综合成统一框架。",
        "discussion_time": 15,
        "input_time": 5,
        "questions": [
            "结合公司战略发展和企业文化，你认为公司管理者最需要具备的核心领导力维度有哪些？请列出并简要说明每个维度的含义。",
            "从业务挑战、团队管理和组织发展三个角度，分别阐述最关键的领导力能力是什么？",
            "参考行业标杆和公司现状，哪些领导力维度是公司当前最缺失、最需要建设的？",
            "请综合以上讨论，归纳出5-8个核心领导力维度，每个维度用一句话定义。",
        ],
    },
    {
        "round_number": 2,
        "title": "讨论二：层级差异化定义",
        "objective": "基于主持人输入的统一维度框架，各组讨论高层、中层、基层在各维度上的差异化定位与标准。",
        "discussion_time": 30,
        "input_time": 5,
        "questions": [
            "在统一领导力维度框架下，高层管理者的核心定位和关键要求是什么？每个维度上高层应展现什么样的领导力？",
            "中层管理者在各维度上与高层相比，侧重点应有何不同？承上启下的角色在领导力上如何体现？",
            "基层管理者在各维度上应达到什么样的基础标准？哪些维度对基层尤为重要？",
            "请用表格形式总结：每个维度 × 三个管理层级的定位与标准差异。",
        ],
    },
    {
        "round_number": 3,
        "title": "讨论三：可观察行为动作",
        "objective": "基于主持人输入的讨论二结果，各组将抽象维度转化为各层级具体、可观察、可考核的行为动作。",
        "discussion_time": 30,
        "input_time": 5,
        "questions": [
            "针对每个领导力维度，高层管理者应展现出哪些具体、可观察的行为动作？请每个维度×层级给出3-5个行为。",
            "中层管理者在日常工作中应如何体现各维度的领导力？请描述具体的行为表现和典型场景。",
            "基层管理者的一线领导力行为有哪些可观察的特征？如何判断基层管理者是否达标？",
            "请为每个维度×管理层级总结出可用于考核评价的关键行为指标。",
        ],
    },
    {
        "round_number": 4,
        "title": "讨论四：落地应用场景",
        "objective": "各组围绕领导力模型在招聘、晋升、培训、考核等场景的落地应用提出建议。",
        "discussion_time": 20,
        "input_time": 5,
        "questions": [
            "领导力模型应如何应用于管理者招聘和选拔？哪些维度和行为可以作为面试评估标准？",
            "领导力模型如何与晋升评估和人才盘点对接？请提出具体的对接机制和建议。",
            "如何将领导力模型嵌入培训发展体系？不同层级的管理者应接受什么样的针对性培养？",
            "领导力模型在日常绩效考核中应如何体现？建议哪些可量化的考核指标？",
        ],
    },
]


async def seed():
    await init_db()
    async with async_session_factory() as session:
        from sqlalchemy import select, func
        result = await session.execute(select(func.count(Workshop.id)))
        count = result.scalar()
        if count > 0:
            print(f"Database already has {count} workshop(s). Skipping seed.")
            return

        workshop = Workshop(
            title="领导力共创研讨会",
            host_name="示例主持人",
            current_round=1,
        )
        session.add(workshop)
        await session.flush()

        for rd in ROUNDS_DATA:
            status = RoundStatus.ACTIVE if rd["round_number"] == 1 else RoundStatus.LOCKED
            round_obj = Round(
                workshop_id=workshop.id,
                round_number=rd["round_number"],
                title=rd["title"],
                objective=rd["objective"],
                status=status,
                discussion_time=rd["discussion_time"],
                input_time=rd["input_time"],
            )
            session.add(round_obj)
            await session.flush()

            for i, q_content in enumerate(rd["questions"], 1):
                session.add(Question(round_id=round_obj.id, content=q_content, order=i))

        await session.commit()
        print(f"Seeded workshop '{workshop.title}' with {len(ROUNDS_DATA)} rounds.")
        print(f"  Invite code: {workshop.invite_code}")
        print(f"  Host code: {workshop.host_code}")
        print(f"  KB admin code: {workshop.kb_admin_code}")


if __name__ == "__main__":
    asyncio.run(seed())
