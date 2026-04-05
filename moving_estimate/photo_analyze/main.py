"""
Photo Pack-Out Analyzer — FastAPI Backend
Moving Estimator Pro integration module

새로 추가된 기능:
  - 이미지 자동 저장 (image_store)
  - 사람 수정 → JSONL 변환 → GPT-4o 자동 재학습 (APScheduler)
  - POST /api/retrain  → 수동 재학습 트리거

엔드포인트:
  POST /api/analyze-photo        → Claude Vision 분석 + 이미지 저장
  POST /api/analyze-batch        → 다중 사진 분석
  POST /api/corrections          → 사용자 수정 저장 (학습 DB)
  GET  /api/corrections          → 수정 이력 조회
  GET  /api/corrections/export   → CSV 다운로드
  GET  /api/corrections/stats    → 학습 통계
  POST /api/retrain              → 수동 재학습 트리거
  GET  /api/retrain/status       → 재학습 이력 조회
  GET  /api/health               → 헬스체크
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db.database import init_db
from routers import analyze, corrections, retrain


scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # ── APScheduler: 1시간마다 corrections 임계값 체크 ─────────────────────
    from services.retrain_trigger import check_and_trigger
    scheduler.add_job(
        check_and_trigger,
        trigger="interval",
        hours=1,
        id="retrain_check",
        replace_existing=True,
    )
    scheduler.start()
    print("[Scheduler] retrain_check 등록 완료 (1시간 주기)")

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Photo Pack-Out Analyzer API",
    description="Claude Vision + 사람 수정 → 자동 재학습 파이프라인",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router,     prefix="/api", tags=["Analysis"])
app.include_router(corrections.router, prefix="/api", tags=["Training DB"])
app.include_router(retrain.router,     prefix="/api", tags=["Retrain"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "photo-packout-analyzer", "version": "2.0.0"}
