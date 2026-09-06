from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./tapattend.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    duplicate_scan_seconds: int = 30
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000"


settings = Settings()
