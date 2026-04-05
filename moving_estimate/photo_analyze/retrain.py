"""
/api/retrain        POST  - 수동 재학습 트리거
/api/retrain/status GET   - 재학습 이력 조회
"""

import aiosqlite
from fastapi import APIRouter, Depends
from db.database import DATABASE_URL

router = APIRouter()


@router.post("/retrain")
async def manual_retrain():
    """
    수동으로 재학습을 즉시 시작합니다.
    임계값 / 쿨다운 조건을 무시하고 바로 실행해요.

    사용 예:
      - 충분한 corrections가 쌓였다고 판단될 때
      - 새 사진 배치를 추가한 직후
      - 테스트 목적
    """
    from services.retrain_trigger import trigger_retrain
    result = await trigger_retrain(trigger="manual")
    return result


@router.get("/retrain/status")
async def retrain_status(limit: int = 10):
    """재학습 이력 + 현재 pending corrections 수"""
    from services.retrain_trigger import _count_pending_corrections, _last_retrain_time, RETRAIN_THRESHOLD

    pending   = await _count_pending_corrections()
    last_time = await _last_retrain_time()

    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT id, trigger, corrections_used, images_used,
                   ft_job_id, ft_model_id, status, started_at, finished_at
            FROM retrain_log
            ORDER BY started_at DESC
            LIMIT ?
        """, (limit,)) as cur:
            history = [dict(r) for r in await cur.fetchall()]

    return {
        "pending_corrections": pending,
        "threshold":           RETRAIN_THRESHOLD,
        "progress_pct":        round(pending / RETRAIN_THRESHOLD * 100, 1),
        "last_retrain":        last_time.isoformat() if last_time else None,
        "history":             history,
    }
