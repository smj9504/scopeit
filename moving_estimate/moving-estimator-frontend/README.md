# Moving Estimator Pro

Content Pack-Out & Restoration Estimation System

## Features

### Quick Estimate
- Room-based estimation with 25+ presets
- Content hints for accurate material calculation
- Customizable density and floor multipliers
- Auto-calculated packing materials
- O&P (Overhead & Profit) toggle with adjustable rate

### Photo Analysis
- Upload photos for AI-powered analysis
- Automatic room detection
- Item categorization and counting
- High-value item identification
- Material suggestions based on detected contents

### History
- Save and manage estimates
- Status tracking (draft, sent, approved)
- View and export saved estimates

## Tech Stack

### Frontend
- React 18
- Vite
- Tailwind CSS
- Lucide Icons

### Backend
- FastAPI (Python)
- SQLAlchemy + SQLite
- Pydantic
- Claude Vision API (for photo analysis)

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+

### Backend Setup

```bash
cd moving-estimator-backend

# Create virtual environment (optional)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (optional)
export ANTHROPIC_API_KEY=your_api_key  # For photo analysis

# Run server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd moving-estimator-frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

### Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## API Endpoints

### Estimates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/estimates/quick` | Generate quick estimate |
| POST | `/api/estimates/save` | Save estimate |
| GET | `/api/estimates/` | List estimates |
| GET | `/api/estimates/{id}` | Get estimate |
| PATCH | `/api/estimates/{id}/status` | Update status |
| DELETE | `/api/estimates/{id}` | Delete estimate |

### Prices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices/` | Get all prices |
| GET | `/api/prices/by-category` | Get prices by category |
| PUT | `/api/prices/{code}` | Update price |
| PUT | `/api/prices/bulk` | Bulk update prices |
| GET | `/api/prices/presets/rooms` | Get room presets |

### Photo Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/photos/analyze` | Analyze photos |
| POST | `/api/photos/analyze-and-estimate` | Analyze + generate estimate |

## Project Structure

```
moving-estimator-pro/
├── moving-estimator-frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application
│   │   ├── main.jsx         # Entry point
│   │   ├── index.css        # Styles
│   │   └── services/
│   │       └── api.js       # API service
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── moving-estimator-backend/
    ├── main.py              # FastAPI app
    ├── requirements.txt
    ├── models/
    │   ├── schemas.py       # Pydantic schemas
    │   └── database.py      # SQLAlchemy models
    ├── routes/
    │   ├── estimates.py     # Estimate endpoints
    │   ├── prices.py        # Price endpoints
    │   └── photos.py        # Photo analysis endpoints
    └── services/
        └── calculator.py    # Calculation logic
```

## Pricing Reference

Based on Xactimate Price List (DMV Region, 01/20/2026)

### Room Rates
- Small Room (2833): $74.52/EA
- Large Room (2834): $148.80/EA
- Extra Large Room (2835): $297.60/EA

### Labor Rates
- Content Manipulation (2825): $67.63/HR
- Supervisor/Admin (2911): $82.60/HR

### Multipliers
| Density | Multiplier |
|---------|------------|
| Light | 0.7x |
| Normal | 1.0x |
| Dense | 1.3x |
| Heavy | 1.6x |

| Floor | Multiplier |
|-------|------------|
| Basement | 1.1x |
| 1st | 1.0x |
| 2nd | 1.15x |
| 3rd | 1.25x |

## Deployment

### Frontend (Vercel)
```bash
npm run build
# Deploy dist/ folder to Vercel
```

### Backend (Railway/Render)
```bash
# Set environment variables:
# - DATABASE_URL
# - ANTHROPIC_API_KEY (optional)

# Deploy with Dockerfile or direct Python
```

## License

MIT
