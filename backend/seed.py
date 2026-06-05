"""
Seed data for leadership workshop: 4 rounds of fixed group discussion questions.
Run with: python seed.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import async_session_factory, init_db
from models import Question, Round, RoundStatus, Workshop

ROUNDS_DATA = [
    {
        "round_number": 1,
        "title": "讨论一：关键领导力维度",
        "objective": "围绕公司业务现状、战略文化、优秀管理实践和标杆企业经验，提炼公司领导力核心维度。",
        "discussion_time": 15,
        "input_time": 15,
        "questions": [
            "结合我们文旅、产业多元化业务现状，你认为一名合格管理者最必备的核心领导力特质有哪些？",
            "结合公司战略发展和企业文化理念，你觉得公司管理者必须坚守的领导素养是什么？",
            "请列举你身边优秀管理者的典型表现，提炼出可复制的领导力关键要素。",
            "目前公司管理中最欠缺、最需要补齐的领导力能力有哪些？",
            "参考华侨城、欢乐谷、华为等标杆企业，你觉得有哪些领导力维度值得我们借鉴纳入公司模型？",
            "从业务发展阶段、跨部门协作、团队管理、风险应对等角度，你认为应该归纳出哪几大领导力维度？",
        ],
    },
    {
        "round_number": 2,
        "title": "讨论二：领导力维度分层",
        "objective": "在统一领导力维度框架下，区分高层、中层、基层管理者的角色定位和差异化标准。",
        "discussion_time": 15,
        "input_time": 15,
        "questions": [
            "在已梳理出的公司领导力统一维度框架下，高层管理者的核心定位与管理侧重点应该是什么？",
            "同样的领导力维度，中层管理者承上启下的角色定位，和高层相比最大区别在哪里？",
            "基层一线管理者在同一领导力框架下，应该侧重哪些基础要求、不用拔高哪些标准？",
            "为避免标准太多记不住，请分别说明：高层、中层、基层，在每个领导力维度上应该「抓重点、做减法」保留哪些核心要求？",
            "从权责、视野、管辖范围、工作重心来看，三个管理层级在同一领导力维度下，分别该设定怎样的差异化门槛？",
        ],
    },
    {
        "round_number": 3,
        "title": "讨论三：领导力行为描述",
        "objective": "将领导力维度拆解为不同管理层级可观察、可执行、可评价的具体行为。",
        "discussion_time": 15,
        "input_time": 15,
        "questions": [
            "针对高层管理者，请逐条写出每个领导力维度对应的具体工作行为、决策动作、管理动作是什么？",
            "针对中层管理者，在每个领导力维度下，日常应该做到哪些常态化管理行为、协同动作、落地动作？",
            "针对基层管理者，每个领导力维度要拆解成一线可执行、可观察的具体日常行为有哪些？",
            "请区分哪些领导力行为是三个层级通用，哪些是高层独有、中层独有、基层独有？",
            "请描述：做到什么具体行为就算达标、出现什么行为就算不符合该层级领导力要求？",
        ],
    },
    {
        "round_number": 4,
        "title": "讨论四：领导力应用场景",
        "objective": "讨论领导力模型在管理者选育用评、数字化观测和企业文化传承中的落地应用。",
        "discussion_time": 15,
        "input_time": 15,
        "questions": [
            "成型后的领导力模型，可以应用在公司哪些场景：管理者招聘、选拔、晋升、盘点、培训、绩效考核哪几项？",
            "领导力模型如何和我们现有人才盘点、管理层述职、年度考评做结合落地？",
            "后续如何把领导力模型融入新人管理者培养、在职管理者赋能培训体系中？",
            "怎样将领导力模型对接钉钉日常行为数据、政能服系统，实现自动观测、记录、评价管理者领导力？",
            "领导力模型如何作为跨部门协同、危机事件处理、战略落地执行的统一管理依据？",
            "后续如何用这套领导力模型统一管理层认知、沉淀企业文化、传承 9 字文化理念？",
        ],
    },
]


async def seed():
    await init_db()
    async with async_session_factory() as session:
        from sqlalchemy import func, select

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
