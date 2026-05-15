# Photo Pack-Out Analyzer API
### Moving Estimator Pro — Vision AI 모듈

사진 업로드 → Claude Vision 분석 → Content List 자동 생성  
사람이 수정한 내용이 누적되면 자동으로 GPT-4o Vision fine-tuning 재학습

---

## 전체 흐름

```
[사진 업로드]
      │
      ▼
analyze-photo API
  ├─ 이미지 디스크 저장 (image_store/)        ← fine-tuning 시 재사용
  ├─ Claude Vision 분석
  ├─ packable 필터 적용 (2중 방어)
  └─ analysis_log 저장 (items_json 포함)      ← 원본 모델 출력 보존
      │
      ▼
[사용자가 Content List 수정]
      │
      ▼
POST /api/corrections                         ← 수정 내용 DB 저장
      │
      ▼
[APScheduler — 1시간마다 체크]
  pending corrections >= 30건 && 마지막 재학습 24시간 이상 경과
      │
      ▼
corrections_to_jsonl                          ← 이미지 + 수정 내용 → JSONL
      │
      ▼
GPT-4o Vision fine-tuning 자동 제출
```

---

## 파일 구조

```
photo_analyzer/
├── main.py                          # FastAPI 앱 + APScheduler 등록
├── requirements.txt
├── db/
│   └── database.py                  # DB 초기화
│                                    #   corrections   — 사용자 수정 이력
│                                    #   image_store   — 업로드 이미지 경로
│                                    #   analysis_log  — 모델 원본 출력 스냅샷
│                                    #   retrain_log   — 재학습 이력
├── models/
│   └── schemas.py                   # Pydantic 요청/응답 스키마
├── routers/
│   ├── analyze.py                   # POST /api/analyze-photo, /analyze-batch
│   ├── corrections.py               # GET/POST /api/corrections
│   └── retrain.py                   # POST /api/retrain, GET /api/retrain/status
└── services/
    ├── claude_vision.py             # Claude Vision 호출 + few-shot 프롬프트
    ├── packable_filter.py           # Pack-out 대상 아이템 2중 필터
    ├── image_store.py               # 이미지 디스크 저장 (MD5 해시 파일명)
    ├── corrections_to_jsonl.py      # corrections DB → GPT-4o fine-tuning JSONL
    └── retrain_trigger.py           # APScheduler 체크 + fine-tuning 제출
```

---

## 빠른 시작

```bash
pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...          # fine-tuning 사용 시 필요
export RETRAIN_THRESHOLD=30           # corrections 임계값 (기본 30)
export RETRAIN_COOLDOWN_HRS=24        # 재학습 최소 간격 시간 (기본 24)
export IMAGE_STORE_DIR=image_store    # 이미지 저장 경로

uvicorn main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/analyze-photo` | 단일 사진 분석 + 이미지 저장 |
| POST | `/api/analyze-batch` | 다중 사진 일괄 분석 |
| POST | `/api/corrections` | 사용자 수정 1건 저장 |
| POST | `/api/corrections/batch` | 사용자 수정 일괄 저장 |
| GET  | `/api/corrections` | 수정 이력 조회 |
| GET  | `/api/corrections/stats` | 학습 통계 |
| GET  | `/api/corrections/export` | CSV 다운로드 |
| POST | `/api/retrain` | 수동 재학습 트리거 |
| GET  | `/api/retrain/status` | 재학습 이력 + pending 건수 |
| GET  | `/api/health` | 헬스체크 |

---

## Packable 아이템 필터 (2중 방어)

**레이어 1 — 프롬프트:** 시스템 프롬프트에 Include/Exclude 목록 명시  
**레이어 2 — 코드 필터 (`packable_filter.py`):** 카테고리 + 키워드 기반 후처리

| 항상 제외 | 예시 |
|-----------|------|
| 건물 구조 | wall, stair, baseboard, drywall |
| 고정 장착 | kitchen cabinet, built-in, backsplash |
| 창문/문 | window frame, door frame, skylight |
| HVAC/배관/전기 | sink, toilet, faucet, ceiling light, ceiling fan |
| 사람/동물 | person, dog, cat |
| 쓰레기 | trash, garbage, debris |
| 고정 바닥재 | hardwood floor, tile floor, wall-to-wall carpet |
| 고정 마이크로웨이브 | over-range microwave, range hood |

| 허용 예외 (키워드 겹쳐도 통과) |
|-------------------------------|
| file cabinet, storage cabinet, medicine cabinet |
| window fan, countertop microwave, portable fan |
| door mat, carpet runner, garbage can |

---

## 사람 수정 → 학습 데이터 변환 방식

```
corrections 레코드
  original_item  = "Leather Sofa"          ← 모델 원본
  corrected_xact = "FURN SOFA"             ← 사람이 수정한 값

analysis_log 레코드
  image_hash = "abc123"
  file_path  = "image_store/abc123.jpg"   ← 저장된 원본 이미지
  items_json = '[{"item_name":"Leather Sofa",...}]'

JSONL 변환 결과
  user:      [이미지]
  assistant: {"room":"Living Room","items":[{"item_name":"Leather Sofa","xactimate_code":"FURN SOFA",...}]}
             ↑ 사람이 수정한 값이 정답(ground truth)이 됨
```

수정 안 된 아이템은 원본 모델 출력 그대로 유지됩니다.  
`used_in_training = 1` 마킹으로 중복 학습을 방지합니다.

---

## 자동 재학습 트리거 조건

APScheduler가 1시간마다 확인:

1. 이미지가 있는 미학습 corrections 수 ≥ `RETRAIN_THRESHOLD`
2. 마지막 재학습으로부터 `RETRAIN_COOLDOWN_HRS` 이상 경과

수동 트리거: `POST /api/retrain`  
진행 상황 확인: `GET /api/retrain/status`

---

## Moving Estimator Pro 연동

```typescript
import { usePhotoAnalyzer } from "./usePhotoAnalyzer";

const { analyzePhoto, saveCorrections, buildCorrection } = usePhotoAnalyzer("session-abc");

// 사진 분석
const result = await analyzePhoto(file, "Living Room");

// 사용자 수정 후 저장 (Save 버튼 클릭 시)
await saveCorrections(editedItems.map(buildCorrection));
// → 자동 재학습 파이프라인에 편입됨
```

---

## 기존 FastAPI 프로젝트에 붙이는 방법

```python
from photo_analyzer.routers import analyze, corrections, retrain
from photo_analyzer.services.retrain_trigger import check_and_trigger
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app):
    await init_db()
    scheduler.add_job(check_and_trigger, "interval", hours=1)
    scheduler.start()
    yield
    scheduler.shutdown()

app.include_router(analyze.router,     prefix="/api")
app.include_router(corrections.router, prefix="/api")
app.include_router(retrain.router,     prefix="/api")
```
