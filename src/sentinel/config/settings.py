# src/sentinel/config/settings.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "sentinel_audit.db"


class Settings(BaseSettings):
    # LLM Settings
    LLM_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    MODEL_NAME: str = "openai/gpt-oss-120b"

    # Database Settings
    DATABASE_URL: str = f"sqlite:///{DEFAULT_DB_PATH}"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",  # 👈 Explicit path to root .env file
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()