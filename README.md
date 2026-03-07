# ScopeIt

Simple estimating software for restoration contractors.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- Docker (optional)

### Option 1: Docker (Recommended)

```bash
# Start all services
docker-compose up -d

# Access the app
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/api/docs
```

### Option 2: Manual Setup

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup database
createdb scopeit_local
alembic upgrade head

# Run server
uvicorn main:app --reload
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

## 📁 Project Structure

```
scopeit/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, database, security
│   │   ├── common/         # Shared utilities
│   │   └── domains/        # Feature modules
│   │       ├── auth/
│   │       ├── company/
│   │       ├── customer/
│   │       ├── estimate/
│   │       ├── invoice/
│   │       └── line_item/
│   ├── alembic/            # Database migrations
│   └── main.py             # Application entry
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── stores/         # Zustand stores
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript types
│   │   └── styles/         # Theme & global styles
│   └── index.html
└── docker-compose.yml
```

## 🎨 Design System

### Colors

| Name | Value | Usage |
|------|-------|-------|
| Primary | `#111827` | Buttons, headers, accents |
| Background | `#f9fafb` | Page background |
| Border | `#e5e7eb` | Card borders, dividers |
| Text Primary | `#111827` | Headings, labels |
| Text Secondary | `#6b7280` | Body text, descriptions |

### Typography

- **Headings**: Plus Jakarta Sans (700, 600)
- **Body**: Inter (400, 500, 600)

### Components

- Border radius: 6px (buttons), 12px (cards)
- Minimal, clean aesthetic
- No excessive shadows or gradients

## ✨ Features

### MVP Features

- [x] User authentication (JWT)
- [x] Company management
- [x] Customer CRUD
- [x] Line item library
- [ ] Estimate creation with sections
- [ ] Multi-select line items
- [ ] Copy/paste between sections
- [ ] Drag & drop reordering
- [ ] Invoice creation
- [ ] PDF export
- [ ] Email sending

### Phase 2

- [ ] Stripe payments
- [ ] SendGrid email integration
- [ ] AWS S3 file storage
- [ ] Usage tracking & limits

## 🔧 Configuration

### Environment Variables

#### Backend (.env.local)

```env
ENV=local
DEBUG=True
DATABASE_URL=postgresql://scopeit:scopeit123@localhost:5432/scopeit_local
SECRET_KEY=your-secret-key
CORS_ORIGINS=http://localhost:3000
BETA_MODE=True
```

#### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:8000/api
```

## 📝 API Documentation

When running locally, visit:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## 📦 Deployment

See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) for deployment guides:
- Vercel (Frontend)
- Render (Backend)
- Neon (Database)

## 📄 License

Proprietary - All rights reserved.

---

Built with ❤️ for restoration contractors.
