"""
/api/analyze-photo   POST  - Analyze single image
/api/analyze-batch   POST  - Analyze multiple images
"""

import hashlib
import time
from fastapi import APIRouter, Depends, HTTPException
from aiosqlite import Connection

from db.database import get_db
from models.schemas import (
    AnalyzePhotoRequest,
    AnalyzeBatchRequest,
    AnalyzePhotoResponse,
    AnalyzeBatchResponse,
)
from services.claude_vision import analyze_photo

router = APIRouter()


async def get_few_shot_examples(db: Connection, room: str | None, limit: int = 5) -> list:
    """Pull recent corrections to feed as few-shot context into the prompt."""
    query = """
        SELECT original_item, corrected_item, original_xact, corrected_xact,
               original_value, corrected_value, room
        FROM corrections
        WHERE corrected_item IS NOT NULL
          AND (room = ? OR ? IS NULL)
        ORDER BY created_at DESC
        LIMIT ?
    """
    async with db.execute(query, (room, room, limit)) as cursor:
        rows = await cursor.fetchall()

    return [
        {
            "room": r["room"],
            "original_item": r["original_item"],
            "corrected_item": r["corrected_item"],
            "original_xact": r["original_xact"],
            "corrected_xact": r["corrected_xact"],
        }
        for r in rows
        if r["corrected_item"]
    ]


async def log_analysis(
    db: Connection,
    session_id: str | None,
    image_hash: str | None,
    file_path:  str | None,
    result: AnalyzePhotoResponse,
):
    import json as _json
    items_json = _json.dumps(
        [item.model_dump() for item in result.items], ensure_ascii=False
    )
    await db.execute(
        """INSERT INTO analysis_log
           (session_id, image_hash, file_path, room_detected,
            item_count, items_json, latency_ms, prompt_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (session_id, image_hash, file_path, result.room_detected,
         result.item_count, items_json, result.latency_ms, result.prompt_version),
    )
    await db.commit()


# ─── Single image ─────────────────────────────────────────────────────────────

@router.post("/analyze-photo", response_model=AnalyzePhotoResponse)
async def analyze_single_photo(
    req: AnalyzePhotoRequest,
    db: Connection = Depends(get_db),
):
    """
    Analyze a single room photo with Claude Vision.
    Returns detected room type + full item list.

    - room_hint: pass the user-selected room label, or omit for auto-detect
    - image_base64: raw base64 string (no data URI prefix)
    - session_id: group multiple photos in one estimate session
    """
    image_hash = req.image_hash or hashlib.md5(req.image_base64[:200].encode()).hexdigest()

    # 이미지 디스크 저장 (fine-tuning 시 재사용)
    from services.image_store import save_image
    image_hash = await save_image(req.image_base64, req.media_type, req.room_hint)

    few_shot   = await get_few_shot_examples(db, req.room_hint)

    try:
        result = await analyze_photo(
            image_base64=req.image_base64,
            media_type=req.media_type,
            room_hint=req.room_hint,
            few_shot_examples=few_shot,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")

    from services.image_store import get_image_path
    file_path = await get_image_path(image_hash)
    await log_analysis(db, req.session_id, image_hash, file_path, result)
    return result


# ─── Batch images ─────────────────────────────────────────────────────────────

@router.post("/analyze-batch", response_model=AnalyzeBatchResponse)
async def analyze_batch_photos(
    req: AnalyzeBatchRequest,
    db: Connection = Depends(get_db),
):
    """
    Analyze multiple room photos in sequence.
    Returns aggregated results with total item count and estimated value.
    """
    results = []
    errors = []

    for img_req in req.images:
        image_hash = img_req.image_hash or hashlib.md5(img_req.image_base64[:200].encode()).hexdigest()
        few_shot   = await get_few_shot_examples(db, img_req.room_hint)

        try:
            from services.image_store import save_image, get_image_path
            image_hash = await save_image(img_req.image_base64, img_req.media_type, img_req.room_hint)
            result     = await analyze_photo(
                image_base64=img_req.image_base64,
                media_type=img_req.media_type,
                room_hint=img_req.room_hint,
                few_shot_examples=few_shot,
            )
            file_path = await get_image_path(image_hash)
            await log_analysis(db, img_req.session_id, image_hash, file_path, result)
            results.append(result)
        except Exception as e:
            errors.append({"image_hash": image_hash, "error": str(e)})

    total_value = sum(
        item.est_value * item.quantity
        for r in results
        for item in r.items
    )

    return AnalyzeBatchResponse(
        results=results,
        total_items=sum(r.item_count for r in results),
        total_est_value=total_value,
    )
