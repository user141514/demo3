"""
Pipeline + Smoke test for LightRAG knowledge base integration.
Usage: E:/Anaconda3/envs/rag-env/python.exe test_lightrag_pipeline.py
"""
import asyncio
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Override settings before importing other modules
os.environ.setdefault("DEEPSEEK_API_KEY", os.environ.get("DEEPSEEK_API_KEY", ""))

def main():
    print("=" * 60)
    print("LightRAG Pipeline Test Suite")
    print("=" * 60)

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        # Check .env
        env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DEEPSEEK_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ["DEEPSEEK_API_KEY"] = api_key

    if not api_key or api_key == "sk-your-key-here":
        print("SKIP: No valid DEEPSEEK_API_KEY found. Set in backend/.env or env var.")
        print("Pipeline test requires API key for embedding + LLM calls.")
        return 1

    print(f"API key: {api_key[:8]}...{api_key[-4:]}")
    return asyncio.run(run_tests())

async def run_tests():
    results = {"pass": 0, "fail": 0, "skip": 0}

    # ---- Test 1: Import & Config ----
    print("\n[Test 1] Import & Config")
    try:
        from config import settings
        from services.knowledge_base_service import KnowledgeBaseService, LightRAGAdapter
        print(f"  KB_LIGHTRAG_DIR: {settings.KB_LIGHTRAG_DIR}")
        print(f"  EMBEDDING_MODEL: {settings.EMBEDDING_MODEL}")
        print(f"  DEEPSEEK_CHAT_MODEL: {settings.DEEPSEEK_CHAT_MODEL}")
        results["pass"] += 1
        print("  PASS")
    except Exception as e:
        results["fail"] += 1
        print(f"  FAIL: {e}")
        return results

    # ---- Test 2: LightRAG Adapter Init ----
    print("\n[Test 2] LightRAG Adapter Initialization")
    test_dir = os.path.join(settings.KB_LIGHTRAG_DIR, "workshop_test")
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    try:
        from services.knowledge_base_service import LightRAGAdapter
        adapter = LightRAGAdapter(test_dir)
        await adapter._ensure_initialized()
        assert adapter._rag is not None
        assert adapter._initialized
        results["pass"] += 1
        print(f"  PASS (working_dir={test_dir})")
    except Exception as e:
        results["fail"] += 1
        print(f"  FAIL: {e}")
        import traceback; traceback.print_exc()
        return results

    # ---- Test 3: Document Insert ----
    print("\n[Test 3] Document Insert via LightRAG")
    test_doc = """
驴迹科技是一家专注于智慧文旅的科技公司，业务覆盖电子导览、智慧景区和文旅大数据。
公司的核心价值观是"搞得定·顶得住·跟我上"，强调解决问题、抗压韧性和领导示范。
文旅行业具有明显的淡旺季特征，节假日期间客流量暴涨，需要提前扩容和技术保障。
领导力模型包含六大维度：战略拆解力、跨部门协同力、危机应对力、团队驱动力、目标达成力、文化践行力。
"""
    try:
        track_id = await adapter.insert(test_doc, doc_id="test_doc_001", file_path="/test/test_doc_001.txt")
        print(f"  track_id: {track_id}")
        results["pass"] += 1
        print("  PASS")
    except Exception as e:
        results["fail"] += 1
        print(f"  FAIL: {e}")
        import traceback; traceback.print_exc()

    # ---- Test 4: Search / Query ----
    print("\n[Test 4] Knowledge Search (Hybrid: Graph + Vector)")
    try:
        # Small wait for async processing
        await asyncio.sleep(2)
        query = "驴迹科技的核心价值观是什么？领导力有哪些维度？"
        context = await adapter.query(query, top_k=5)
        if context and len(context.strip()) > 20:
            print(f"  Context length: {len(context)} chars")
            print(f"  Preview: {context[:200]}...")
            results["pass"] += 1
            print("  PASS")
        else:
            print(f"  Context too short: '{context}'")
            results["fail"] += 1
            print("  FAIL: empty or too short result")
    except Exception as e:
        results["fail"] += 1
        print(f"  FAIL: {e}")
        import traceback; traceback.print_exc()

    # ---- Test 5: KB Service Integration ----
    print("\n[Test 5] KnowledgeBaseService Integration")
    from database import init_db, async_session_factory
    from models import Workshop

    await init_db()

    async with async_session_factory() as db:
        from services.knowledge_base_service import KnowledgeBaseService
        kb_service = KnowledgeBaseService(db)

        # Create a test workshop
        workshop = Workshop(
            title="Pipeline Test Workshop",
            host_name="TestHost",
            group_count=4,
        )
        db.add(workshop)
        await db.commit()
        await db.refresh(workshop)
        print(f"  Created workshop id={workshop.id}")

        # Upload a test doc
        test_content = """
驴迹科技核心价值观：搞得定·顶得住·跟我上。
"搞得定"代表解决问题的能力和决心。"顶得住"体现抗压能力和韧性。"跟我上"强调领导力和示范作用。
领导力六大维度底稿：① 战略拆解力 ② 跨部门协同力 ③ 危机应对力 ④ 团队驱动力 ⑤ 目标达成力 ⑥ 文化践行力。
管理层级定义：高层（总裁/副总裁）聚焦战略全局；中层（总监/总经理/副总经理）聚焦目标承接和跨部门协同；基层（主管/组长）聚焦一线带队和任务分解。
文旅行业典型场景：节假日旺季保障、新产品快速交付、跨区域项目管理、突发事件响应。
""".strip()

        doc = await kb_service.upload(
            filename="pipeline_test.txt",
            content=test_content.encode("utf-8"),
            content_type="text/plain",
            workshop_id=workshop.id,
        )
        print(f"  Uploaded doc id={doc.id}, chunks={doc.chunk_count}")

        # Search via KB service
        results_list = await kb_service.search("驴迹科技核心价值观", workshop.id, top_k=3)
        print(f"  Search results: {len(results_list)} chunk(s)")
        if results_list:
            print(f"  First 100 chars: {results_list[0][:100]}...")
            results["pass"] += 1
            print("  PASS")
        else:
            results["fail"] += 1
            print("  FAIL: no results")

    # ---- Test 6: Cleanup ----
    print("\n[Test 6] Cleanup")
    try:
        shutil.rmtree(test_dir, ignore_errors=True)
        # Clean workshop-specific test dir too
        ws_test_dir = os.path.join(settings.KB_LIGHTRAG_DIR, f"workshop_{workshop.id}")
        shutil.rmtree(ws_test_dir, ignore_errors=True)
        print("  PASS")
    except Exception as e:
        print(f"  Warning: {e}")

    # ---- Summary ----
    print("\n" + "=" * 60)
    print(f"Results: {results['pass']} pass, {results['fail']} fail, {results['skip']} skip")
    print("=" * 60)
    return 0 if results["fail"] == 0 else 1


if __name__ == "__main__":
    exit(main())
