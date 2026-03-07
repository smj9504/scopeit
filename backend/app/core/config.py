"""
ScopeIt - Application Configuration
"""
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # ===================
    # Environment
    # ===================
    ENV: str = "local"  # local, stage, production
    DEBUG: bool = True
    APP_NAME: str = "ScopeIt"
    APP_VERSION: str = "1.0.0"
    
    # ===================
    # Server
    # ===================
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    
    # ===================
    # Database
    # ===================
    DATABASE_URL: str = "postgresql://scopeit:scopeit123@localhost:5432/scopeit_local"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    
    # ===================
    # Security
    # ===================
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BCRYPT_ROUNDS: int = 12
    
    # ===================
    # CORS
    # ===================
    CORS_ORIGINS: str = "http://localhost:3001"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # ===================
    # Frontend URL
    # ===================
    FRONTEND_URL: str = "http://localhost:3001"
    
    # ===================
    # Beta Mode
    # ===================
    BETA_MODE: bool = True
    BETA_END_DATE: str = "2026-06-30"
    
    # ===================
    # Google OAuth
    # ===================
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8001/api/auth/google/callback"

    # ===================
    # Stripe (Phase 2)
    # ===================
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_ID_PRO_MONTHLY: Optional[str] = None
    STRIPE_PRICE_ID_PRO_YEARLY: Optional[str] = None
    
    # ===================
    # Email (Phase 2)
    # ===================
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: str = "noreply@scopeit.work"
    EMAIL_FROM_NAME: str = "ScopeIt"
    
    # ===================
    # File Storage
    # ===================
    STORAGE_PROVIDER: str = "local"  # local, s3
    STORAGE_BASE_DIR: str = "uploads"
    
    class Config:
        env_file = ".env.local"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings based on environment"""
    env = os.getenv("ENV", "local")
    env_file = f".env.{env}" if os.path.exists(f".env.{env}") else ".env.local"
    return Settings(_env_file=env_file)


settings = get_settings()
