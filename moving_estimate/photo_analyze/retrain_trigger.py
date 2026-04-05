"""
retrain_trigger.py
────────────────────────────────────────────────────────────────
누적 corrections가 임계값에 도달하면 자동으로 fine-tuning을 시작합니다.
APScheduler로 기존 FastAPI main.py lifespan에 붙여서 사용해요.

트리거 조건 (모두 충족 시):
  1. used_in_training = 0 인 corrections 수 >= RETRAIN_THRESHOLD
  2. 마지막 retrain으로부터 RETRAIN_COOLDOWN_HOURS 이상 경과
  3. 이미지 파일이 실제로 존재하는 corrections만 카운트
"""

import os
import json
import asyncio
import aiosqlite
from datetime import datetime, timedelta

from db.database  import DATABASE_URL
from services.corrections_to_jsonl import build_training_jsonl

# ── 설정 ──────────────────────────────────────────────────────────────────────
RETRAIN_THRESHOLD    = int(os.getenv("RETRAIN_THRESHOLD",    "30"))   # corrections 누적 건수
RETRAIN_COOLDOWN_HRS = int(os.getenv("RETRAIN_COOLDOWN_HRS", "24"))   # 재학습 최소 간격 (시간)
OPENAI_API_KEY       = os.getenv("OPENAI_API_KEY", "")
JSONL_DIR            = os.getenv("JSONL_DIR", "training_data")


# ── DB 헬퍼 ───────────────────────────────────────────────────────────────────
async def _count_pending_corrections() -> int:
    """학습에 사용 안 된 corrections 중 이미지 있는 것만 카운트"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        async with db.execute("""
            SELECT COUNT(DISTINCT c.id)
            FROM corrections c
            JOIN analysis_log a ON c.image_hash = a.image_hash
            WHERE c.used_in_training = 0
              AND a.file_path IS NOT NULL
        """) as cur:
            row = await cur.fetchone()
    return row[0] if row else 0


async def _last_retrain_time() -> datetime | None:
    """마지막 성공한 retrain 시각"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        async with db.execute("""
            SELECT finished_at FROM retrain_log
            WHERE status = 'done'
            ORDER BY finished_at DESC LIMIT 1
        """) as cur:
            row = await cur.fetchone()
    if row and row[0]:
        return datetime.fromisoformat(row[0])
    return None


async def _log_retrain(trigger: str, n_corrections: int, n_images: int, jsonl_path: str) -> int:
    """retrain_log 에 새 레코드 삽입, retrain_id 반환"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute("""
            INSERT INTO retrain_log (trigger, corrections_used, images_used, jsonl_path, status)
            VALUES (?, ?, ?, ?, 'running')
        """, (trigger, n_corrections, n_images, jsonl_path))
        await db.commit()
        return cursor.lastrowid


async def _update_retrain(retrain_id: int, status: str, ft_job_id: str = None, ft_model_id: str = None):
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute("""
            UPDATE retrain_log
            SET status = ?, ft_job_id = ?, ft_model_id = ?, finished_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (status, ft_job_id, ft_model_id, retrain_id))
        await db.commit()


# ── 재학습 실행 ───────────────────────────────────────────────────────────────
async def _run_gpt4o_finetune(jsonl_path: str) -> tuple[str, str]:
    """
    GPT-4o fine-tuning 비동기 실행
    반환: (job_id, model_id or '')
    """
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    # 파일 업로드
    with open(jsonl_path, "rb") as f:
        file_resp = client.files.create(file=f, purpose="fine-tune")
    file_id = file_resp.id
    print(f"  [RETRAIN] 파일 업로드 완료: {file_id}")

    # fine-tuning 잡 생성
    job = client.fine_tuning.jobs.create(
        model="gpt-4o-2024-08-06",
        training_file=file_id,
        suffix="packout-human",
        hyperparameters={"n_epochs": 3},
    )
    print(f"  [RETRAIN] fine-tuning 잡 생성: {job.id}")
    return job.id, ""   # model_id는 완료 후 webhook/polling으로 수신


async def trigger_retrain(trigger: str = "threshold") -> dict:
    """
    재학습 파이프라인 실행
    trigger: 'threshold' (자동) | 'manual' (수동 API 호출)
    """
    os.makedirs(JSONL_DIR, exist_ok=True)
    ts         = datetime.now().strftime("%Y%m%d_%H%M%S")
    jsonl_path = os.path.join(JSONL_DIR, f"corrections_{ts}.jsonl")

    print(f"\n[RETRAIN] 시작 — trigger={trigger}")

    # JSONL 빌드
    path, n_images, n_corrections = await build_training_jsonl(
        output_path=jsonl_path,
        min_corrections_per_image=1,
    )

    if n_images == 0:
        print("  [RETRAIN] 학습 가능한 데이터 없음 — 중단")
        return {"status": "skipped", "reason": "no_data"}

    retrain_id = await _log_retrain(trigger, n_corrections, n_images, path)

    # GPT-4o fine-tuning 제출 (OPENAI_API_KEY 있을 때만)
    if OPENAI_API_KEY:
        try:
            job_id, model_id = await asyncio.get_event_loop().run_in_executor(
                None, lambda: asyncio.run(_run_gpt4o_finetune(path))
            )
            await _update_retrain(retrain_id, "running", ft_job_id=job_id)
            print(f"  [RETRAIN] GPT-4o fine-tuning 제출 완료: job_id={job_id}")
            return {"status": "submitted", "job_id": job_id, "images": n_images,
                    "corrections": n_corrections, "jsonl": path}
        except Exception as e:
            await _update_retrain(retrain_id, "failed")
            print(f"  [RETRAIN] fine-tuning 실패: {e}")
            return {"status": "failed", "error": str(e)}
    else:
        # API 키 없으면 JSONL만 저장 (나중에 수동 제출)
        await _update_retrain(retrain_id, "done")
        print(f"  [RETRAIN] JSONL 저장 완료 (OPENAI_API_KEY 미설정 — 수동 제출 필요): {path}")
        return {"status": "jsonl_ready", "jsonl": path, "images": n_images,
                "corrections": n_corrections}


# ── 스케줄러 체크 함수 (APScheduler에서 호출) ────────────────────────────────
async def check_and_trigger():
    """
    1시간마다 실행되는 체크 함수.
    조건 충족 시 trigger_retrain() 호출.
    """
    pending = await _count_pending_corrections()
    print(f"[RETRAIN CHECK] pending corrections: {pending} / threshold: {RETRAIN_THRESHOLD}")

    if pending < RETRAIN_THRESHOLD:
        return  # 아직 부족

    last_time = await _last_retrain_time()
    if last_time:
        elapsed_hrs = (datetime.now() - last_time).total_seconds() / 3600
        if elapsed_hrs < RETRAIN_COOLDOWN_HRS:
            print(f"  [RETRAIN CHECK] 쿨다운 중 ({elapsed_hrs:.1f}h / {RETRAIN_COOLDOWN_HRS}h)")
            return

    print(f"  [RETRAIN CHECK] 임계값 도달 → 재학습 시작")
    await trigger_retrain(trigger="threshold")
