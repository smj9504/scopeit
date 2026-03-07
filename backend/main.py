"""
ScopeIt - FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import engine, Base

# Import all models to register them with SQLAlchemy
from app.domains.user.models import User
from app.domains.company.models import Company
from app.domains.customer.models import Customer
from app.domains.line_item.models import LineItem
from app.domains.estimate.models import Estimate
from app.domains.invoice.models import Invoice
from app.domains.settings.models import (
    EstimateStatusConfig, InvoiceStatusConfig, LineItemCategory, LineItemUnit
)
from app.domains.admin.models import LoginLog, UserActivity

# Import routers
from app.domains.auth.api import router as auth_router
from app.domains.company.api import router as company_router
from app.domains.customer.api import router as customer_router
from app.domains.line_item.api import router as line_item_router
from app.domains.estimate.api import router as estimate_router
from app.domains.invoice.api import router as invoice_router
from app.domains.dashboard.api import router as dashboard_router
from app.domains.settings.api import router as settings_router
from app.domains.admin.api import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"Environment: {settings.ENV}")
    print(f"Beta Mode: {settings.BETA_MODE}")

    # Create database tables (for local development)
    if settings.ENV == "local":
        print("Creating database tables...")
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully")

    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Simple estimating software for restoration contractors",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# Session middleware (required for OAuth)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env": settings.ENV,
    }


# API Info
@app.get("/api")
async def api_info():
    """API information"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "beta_mode": settings.BETA_MODE,
    }


# Include routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(company_router, prefix="/api/company", tags=["Company"])
app.include_router(customer_router, prefix="/api/customers", tags=["Customers"])
app.include_router(line_item_router, prefix="/api/line-items", tags=["Line Items"])
app.include_router(estimate_router, prefix="/api/estimates", tags=["Estimates"])
app.include_router(invoice_router, prefix="/api/invoices", tags=["Invoices"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
