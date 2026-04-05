"""
Database initialization — SQLite via aiosqlite
Switch DATABASE_URL to PostgreSQL (asyncpg) for production
"""

import os
import aiosqlite

DATABASE_URL  = os.getenv("DATABASE_URL",   "photo_analyzer.db")
IMAGE_STORE   = os.getenv("IMAGE_STORE_DIR","image_store")      # 업로드 이미지 저장 경로


async def get_db():
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db():
    os.makedirs(IMAGE_STORE, exist_ok=True)

    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS corrections (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT,
                image_hash      TEXT,            -- 원본 이미지와 JOIN 키
                room            TEXT NOT NULL,
                original_item   TEXT NOT NULL,
                corrected_item  TEXT,
                original_qty    INTEGER,
                corrected_qty   INTEGER,
                original_cond   TEXT,
                corrected_cond  TEXT,
                original_cat    TEXT,
                corrected_cat   TEXT,
                original_xact   TEXT,
                corrected_xact  TEXT,
                original_value  INTEGER,
                corrected_value INTEGER,
                used_in_training INTEGER DEFAULT 0,  -- 학습에 포함됐는지 여부
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_corrections_room
                ON corrections(room);
            CREATE INDEX IF NOT EXISTS idx_corrections_xact
                ON corrections(original_xact, corrected_xact);
            CREATE INDEX IF NOT EXISTS idx_corrections_session
                ON corrections(session_id);
            CREATE INDEX IF NOT EXISTS idx_corrections_training
                ON corrections(used_in_training, created_at);

            -- 업로드된 이미지 저장 (image_hash → 파일 경로)
            CREATE TABLE IF NOT EXISTS image_store (
                image_hash  TEXT PRIMARY KEY,
                file_path   TEXT NOT NULL,       -- IMAGE_STORE_DIR 내 상대 경로
                media_type  TEXT DEFAULT 'image/jpeg',
                room_hint   TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 분석 이력 (이미지별 모델 출력 스냅샷)
            CREATE TABLE IF NOT EXISTS analysis_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT,
                image_hash      TEXT,
                file_path       TEXT,            -- 이미지 파일 경로 (fine-tuning 시 사용)
                room_detected   TEXT,
                item_count      INTEGER,
                items_json      TEXT,            -- 모델 원본 출력 (JSON) — 학습 라벨 기준
                model_used      TEXT DEFAULT 'claude-sonnet-4-20250514',
                prompt_version  INTEGER DEFAULT 1,
                latency_ms      INTEGER,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_analysis_hash
                ON analysis_log(image_hash);

            -- 재학습 이력
            CREATE TABLE IF NOT EXISTS retrain_log (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                trigger             TEXT,        -- 'threshold' | 'manual'
                corrections_used    INTEGER,
                images_used         INTEGER,
                jsonl_path          TEXT,
                ft_job_id           TEXT,        -- OpenAI fine-tuning job ID
                ft_model_id         TEXT,        -- 완료된 모델 ID
                status              TEXT DEFAULT 'queued',  -- queued|running|done|failed
                started_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                finished_at         DATETIME
            );
        """)
        await db.commit()
        print("[DB] Tables initialized")
