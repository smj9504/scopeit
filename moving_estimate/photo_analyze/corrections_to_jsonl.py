"""
corrections_to_jsonl.py
────────────────────────────────────────────────────────────────
사람이 수정한 corrections → Vision fine-tuning JSONL 변환기

변환 로직:
  corrections 레코드 + analysis_log(원본 모델 출력) + image_store(이미지 경로)
  → 수정된 최종 아이템 목록
  → GPT-4o Vision fine-tuning JSONL

핵심 원칙:
  "사람이 수정한 것"이 정답(assistant response)이 된다.
  수정 안 된 아이템은 원본 모델 출력을 그대로 사용한다.
"""

import json
import os
import base64
import aiosqlite
from pathlib import Path

from db.database import DATABASE_URL, IMAGE_STORE
from services.packable_filter import filter_items

SYSTEM_PROMPT = """You are an expert contents pack-out estimator for insurance restoration
(water/fire/smoke damage) in the DMV area (DC, Maryland, Virginia).
Identify ONLY packable personal property. Return JSON only.

{
  "room_detected": "Living Room",
  "items": [
    {
      "item_name": "Leather Sectional Sofa",
      "quantity": 1,
      "condition": "Good",
      "category": "Furniture",
      "xactimate_code": "FURN SOFA",
      "est_value": 1400
    }
  ]
}"""

USER_PROMPT = (
    "Identify ONLY packable personal property items in this photo. "
    "Do NOT list building fixtures, cabinets, windows, doors, people, animals, or trash. "
    "Return JSON only."
)


def _image_to_data_uri(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    mt  = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
           ".png": "image/png",  ".webp": "image/webp"}.get(ext, "image/jpeg")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mt};base64,{b64}", mt


def _apply_corrections_to_items(
    original_items: list[dict],
    corrections:    list[dict],
) -> list[dict]:
    """
    원본 아이템 목록에 사람의 수정사항을 적용한 최종 목록 반환.

    corrections 레코드 1개 = 아이템 1개의 특정 필드 수정.
    같은 아이템에 여러 수정이 있으면 모두 적용 (최신 우선).
    """
    # image_hash + original_item → 수정사항 매핑
    corr_map: dict[str, dict] = {}
    for c in sorted(corrections, key=lambda x: x.get("created_at", "")):
        key = c["original_item"].lower().strip()
        if key not in corr_map:
            corr_map[key] = {}
        if c.get("corrected_item"):
            corr_map[key]["item_name"]      = c["corrected_item"]
        if c.get("corrected_qty") is not None:
            corr_map[key]["quantity"]        = c["corrected_qty"]
        if c.get("corrected_cond"):
            corr_map[key]["condition"]       = c["corrected_cond"]
        if c.get("corrected_cat"):
            corr_map[key]["category"]        = c["corrected_cat"]
        if c.get("corrected_xact"):
            corr_map[key]["xactimate_code"]  = c["corrected_xact"]
        if c.get("corrected_value") is not None:
            corr_map[key]["est_value"]       = c["corrected_value"]

    # 원본 아이템에 수정 적용
    result = []
    for item in original_items:
        key     = item.get("item_name", "").lower().strip()
        updated = {**item, **(corr_map.get(key, {}))}
        result.append(updated)

    return result


def _build_jsonl_record(
    image_path:  str,
    room:        str,
    final_items: list[dict],
) -> dict:
    """GPT-4o Vision fine-tuning JSONL 레코드 생성"""
    data_uri, media_type = _image_to_data_uri(image_path)

    assistant_payload = {
        "room_detected": room,
        "items": final_items,
    }

    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": USER_PROMPT},
                ],
            },
            {
                "role": "assistant",
                "content": json.dumps(assistant_payload, ensure_ascii=False),
            },
        ]
    }


async def build_training_jsonl(
    output_path:     str = "human_corrections_finetune.jsonl",
    since_retrain_id: int = 0,          # 이 retrain_id 이후 corrections만 사용
    min_corrections_per_image: int = 1,  # 이미지당 최소 수정 건수 (품질 필터)
) -> tuple[str, int, int]:
    """
    corrections DB + analysis_log + image_store → JSONL 생성

    반환: (output_path, n_images, n_corrections_used)
    """
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row

        # 1. 아직 학습에 사용 안 된 corrections 조회
        async with db.execute("""
            SELECT c.*, a.file_path, a.items_json, a.room_detected
            FROM corrections c
            LEFT JOIN analysis_log a ON c.image_hash = a.image_hash
            WHERE c.used_in_training = 0
              AND a.file_path IS NOT NULL
              AND a.items_json IS NOT NULL
            ORDER BY c.image_hash, c.created_at
        """) as cur:
            rows = await cur.fetchall()

    if not rows:
        print("  [JSONL] 새 corrections 없음")
        return output_path, 0, 0

    # 2. image_hash 단위로 그룹핑
    groups: dict[str, dict] = {}
    for row in rows:
        h = row["image_hash"]
        if h not in groups:
            groups[h] = {
                "file_path":    row["file_path"],
                "room":         row["room_detected"] or row["room"],
                "items_json":   row["items_json"],
                "corrections":  [],
                "corr_ids":     [],
            }
        groups[h]["corrections"].append(dict(row))
        groups[h]["corr_ids"].append(row["id"])

    # 3. 최소 수정 기준 미달 이미지 제외
    qualified = {
        h: g for h, g in groups.items()
        if len(g["corrections"]) >= min_corrections_per_image
    }
    skipped = len(groups) - len(qualified)
    if skipped:
        print(f"  [JSONL] {skipped}개 이미지 제외 (수정 {min_corrections_per_image}건 미만)")

    # 4. JSONL 생성
    records    = []
    used_ids   = []
    n_images   = 0

    for image_hash, g in qualified.items():
        if not os.path.exists(g["file_path"]):
            print(f"  [JSONL] 이미지 파일 없음: {g['file_path']} — 건너뜀")
            continue

        try:
            original_items = json.loads(g["items_json"])
        except (json.JSONDecodeError, TypeError):
            print(f"  [JSONL] items_json 파싱 실패: {image_hash} — 건너뜀")
            continue

        # 수정사항 적용 + packable 필터
        merged, _  = filter_items(
            _apply_corrections_to_items(original_items, g["corrections"]),
            log=False,
        )

        if not merged:
            continue

        record = _build_jsonl_record(g["file_path"], g["room"], merged)
        records.append(record)
        used_ids.extend(g["corr_ids"])
        n_images += 1

    if not records:
        print("  [JSONL] 유효한 레코드 없음")
        return output_path, 0, 0

    # 5. JSONL 파일 저장
    with open(output_path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # 6. 사용된 corrections → used_in_training = 1 마킹
    if used_ids:
        async with aiosqlite.connect(DATABASE_URL) as db:
            placeholders = ",".join("?" * len(used_ids))
            await db.execute(
                f"UPDATE corrections SET used_in_training = 1 WHERE id IN ({placeholders})",
                used_ids,
            )
            await db.commit()

    print(f"  [JSONL] {n_images}개 이미지 / {len(used_ids)}건 corrections → {output_path}")
    return output_path, n_images, len(used_ids)
