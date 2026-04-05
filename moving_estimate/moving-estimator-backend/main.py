"""
Moving Estimator Pro - Backend API
FastAPI application for content pack-out estimation
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from routes import estimates, prices, photos, export, settings
from models.database import create_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_tables()
    yield
    # Shutdown

app = FastAPI(
    title="Moving Estimator Pro API",
    description="Content Pack-Out & Restoration Estimation System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(estimates.router, prefix="/api/estimates", tags=["Estimates"])
app.include_router(prices.router, prefix="/api/prices", tags=["Prices"])
app.include_router(photos.router, prefix="/api/photos", tags=["Photo Analysis"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])

# Static file serving for uploaded photos
upload_dir = os.path.join(os.path.dirname(__file__), "storage", "uploads")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")


@app.get("/")
async def root():
    return {"message": "Moving Estimator Pro API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
