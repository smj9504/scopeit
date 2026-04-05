"""
image_store.py
────────────────────────────────────────────────────────────────
업로드된 이미지를 디스크에 저장하고 image_hash로 조회

왜 필요한가:
  Vision fine-tuning은 이미지 + 라벨 쌍이 필요합니다.
  사용자 수정(corrections)에는 image_hash만 있으므로
  원본 이미지를 서버에 보관해야 나중에 학습 데이터를 만들 수 있어요.
"""

import os
import hashlib
import base64
import aiosqlite
from pathlib import Path

from db.database import DATABASE_URL, IMAGE_STORE


def _compute_hash(b64_data: str) -> str:
    """base64 데이터 → MD5 해시 (16진수 32자)"""
    raw = base64.b64decode(b64_data)
    return hashlib.md5(raw).hexdigest()


def _ext_from_media_type(media_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png":  ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
    }.get(media_type, ".jpg")


async def save_image(
    image_base64: str,
    media_type:   str = "image/jpeg",
    room_hint:    str = None,
) -> str:
    """
    이미지를 디스크에 저장하고 image_hash를 반환합니다.
    이미 저장된 이미지는 중복 저장하지 않아요 (해시 중복 체크).
    """
    image_hash = _compute_hash(image_base64)
    ext        = _ext_from_media_type(media_type)
    file_name  = f"{image_hash}{ext}"
    file_path  = os.path.join(IMAGE_STORE, file_name)

    # 중복 체크 — 이미 저장된 이미지면 DB만 업데이트
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT image_hash FROM image_store WHERE image_hash = ?", (image_hash,)
        ) as cur:
            existing = await cur.fetchone()

        if not existing:
            # 디스크에 저장
            raw = base64.b64decode(image_base64)
            with open(file_path, "wb") as f:
                f.write(raw)

            await db.execute(
                """INSERT INTO image_store (image_hash, file_path, media_type, room_hint)
                   VALUES (?, ?, ?, ?)""",
                (image_hash, file_path, media_type, room_hint),
            )
            await db.commit()

    return image_hash


async def get_image_path(image_hash: str) -> str | None:
    """image_hash → 디스크 파일 경로 (없으면 None)"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT file_path FROM image_store WHERE image_hash = ?", (image_hash,)
        ) as cur:
            row = await cur.fetchone()
    return row["file_path"] if row else None
