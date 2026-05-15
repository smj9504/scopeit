# ScopeIt

Simple estimating software for restoration contractors.

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+ (local) or NeonDB (cloud)
- Docker (optional)

### Option 1: Docker

```bash
docker-compose up -d

# Frontend: http://localhost:3001
# Backend:  http://localhost:8001
# API Docs: http://localhost:8001/api/docs
```

### Option 2: Manual Setup

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Local DB
createdb scopeit_local
alembic upgrade head

# Run server
uvicorn main:app --reload --port 8001
```

#### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:3001
```

## Project Structure

```
scopeit/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, database, security, storage
│   │   ├── common/         # Shared utilities
│   │   └── domains/        # Feature modules (DDD)
│   │       ├── auth/
│   │       ├── company/
│   │       ├── customer/
│   │       ├── estimate/
│   │       ├── invoice/
│   │       ├── line_item/
│   │       └── tools/      # PDF editor, packing, roof analyzer
│   ├── alembic/            # Database migrations
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── stores/         # Zustand stores
│   │   ├── hooks/          # Custom hooks
│   │   └── types/          # TypeScript types
│   └── index.html
├── render.yaml             # Render deployment blueprint
└── docker-compose.yml
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite 5, Ant Design 5, Zustand, TanStack Query |
| Backend | FastAPI, Python 3.11+, SQLAlchemy 2.0 (sync), Pydantic V2 |
| Database | PostgreSQL 15 (NeonDB in production) |
| File Storage | Local (dev) / Cloudflare R2 (production) |
| Auth | JWT (HS256), Google OAuth |
| PDF | WeasyPrint, PyPDF, ReportLab, pdf2image |

## Deployment

### Architecture

```
Users → Vercel (Frontend) → Render (Backend API) → NeonDB (PostgreSQL)
                                    ↕
                            Cloudflare R2 (Files)
```

| Service | Provider | URL |
|---------|----------|-----|
| Frontend | Vercel | `scopeit.work` |
| Backend | Render | `api.scopeit.work` |
| Database | NeonDB | `ep-xxx.neon.tech` |
| Files | Cloudflare R2 | `scopeit-uploads` bucket |

### 1. NeonDB Setup

1. Create project at [neon.tech](https://neon.tech)
2. Copy connection string: `postgresql://user:pass@ep-xxx.neon.tech/scopeit?sslmode=require`
3. To use the same DB locally, update `backend/.env.local`:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/scopeit?sslmode=require
   ```

#### Migrate Local Data to NeonDB

```bash
# Dump local DB
pg_dump -U postgres -d scopeit_local -Fc -f scopeit_backup.dump

# Restore to NeonDB
pg_restore -h ep-xxx.neon.tech -U scopeit -d scopeit \
  --no-owner --no-privileges scopeit_backup.dump
```

### 2. Cloudflare R2 Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. Create bucket: `scopeit-uploads`
3. Create API token: R2 → Manage R2 API Tokens → Create API Token
4. Note: `Account ID`, `Access Key ID`, `Secret Access Key`
5. Endpoint URL: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

#### Migrate Local Files to R2

```bash
# Install rclone
# Configure rclone with R2 credentials, then:
rclone copy ./backend/uploads r2:scopeit-uploads --progress
```

After migrating files, update `file_path` and `thumbnail_path` columns
in the database to use storage keys (strip the `uploads/` prefix):

```sql
UPDATE pdf_documents
SET file_path = REPLACE(file_path, 'uploads/', ''),
    thumbnail_path = REPLACE(thumbnail_path, 'uploads/', '')
WHERE file_path LIKE 'uploads/%';

UPDATE company_documents
SET file_path = REPLACE(file_path, 'uploads/', ''),
    thumbnail_path = REPLACE(thumbnail_path, 'uploads/', '')
WHERE file_path LIKE 'uploads/%';

UPDATE sign_requests
SET signed_file_path = REPLACE(signed_file_path, 'uploads/', '')
WHERE signed_file_path LIKE 'uploads/%';
```

### 3. Render (Backend)

1. Connect GitHub repo at [render.com](https://render.com)
2. Use `render.yaml` blueprint or create Web Service manually:
   - **Runtime**: Python
   - **Root Directory**: `backend`
   - **Build**: `pip install -r requirements.txt && alembic upgrade head`
   - **Start**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables in Render dashboard:
   - `DATABASE_URL` (NeonDB connection string)
   - `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ANTHROPIC_API_KEY`
4. Add custom domain: `api.scopeit.work`

### 4. Vercel (Frontend)

1. Import repo at [vercel.com](https://vercel.com)
2. Set **Root Directory**: `frontend`
3. Set environment variable:
   ```
   VITE_API_URL=https://api.scopeit.work/api
   ```
4. Add custom domain: `scopeit.work`

### 5. DNS Configuration

```
scopeit.work        → CNAME → cname.vercel-dns.com
www.scopeit.work    → CNAME → cname.vercel-dns.com
api.scopeit.work    → CNAME → scopeit-api.onrender.com
```

### 6. Post-Deployment Checklist

- [ ] Update Google OAuth redirect URI to `https://api.scopeit.work/api/auth/google/callback`
- [ ] Verify CORS allows `https://scopeit.work`
- [ ] Test file upload/download with R2
- [ ] Test PDF editor operations (merge, rotate, sign)
- [ ] Test Google OAuth login flow

## Environment Variables

### Backend (.env.local)

```env
ENV=local
DEBUG=True
DATABASE_URL=postgresql://scopeit:scopeit123@localhost:5432/scopeit_local
SECRET_KEY=dev-secret-key
CORS_ORIGINS=http://localhost:3001
BETA_MODE=True

# File storage (default: local)
STORAGE_PROVIDER=local
STORAGE_BASE_DIR=uploads

# Optional: use R2 locally
# STORAGE_PROVIDER=r2
# R2_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
# R2_ACCESS_KEY_ID=xxx
# R2_SECRET_ACCESS_KEY=xxx
# R2_BUCKET_NAME=scopeit-uploads
```

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:8001/api
```

## Design System

| Property | Value |
|----------|-------|
| Primary | `#111827` |
| Background | `#f9fafb` |
| Border | `#e5e7eb` |
| Headings | Plus Jakarta Sans |
| Body | Inter |
| Border Radius | 6px (buttons), 12px (cards) |

**UI Library**: Ant Design 5 with custom theme

## API Documentation

- Swagger: http://localhost:8001/api/docs
- ReDoc: http://localhost:8001/api/redoc

## Testing

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test
```

## License

Proprietary - All rights reserved.
