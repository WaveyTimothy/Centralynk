from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://geo_user:password@geo-postgres:5432/geo_db"
    redis_url: str = "redis://:password@geo-redis:6379/0"
    groq_api_key: str = ""
    telegram_bot_token: str = ""
    secret_key: str = ""
    environment: str = "production"
    ollama_url: str = "http://ollama:11434"
    crawl4ai_url: str = "http://crawl4ai:11235"
    max_retries: int = 3
    max_tokens: int = 1024

    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    return Settings()
