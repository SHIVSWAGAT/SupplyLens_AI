import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from secrets import token_urlsafe

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency fallback before install
    def load_dotenv(path: Path) -> bool:
        if not path.exists():
            return False

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        return True


def _split_csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


BASE_DIR = Path(__file__).resolve().parent
# Secrets should come from the local .env file or the Render dashboard, never from source control.
load_dotenv(BASE_DIR / ".env")


def _normalize_provider(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "google": "gemini",
        "google-gemini": "gemini",
        "google_gemini": "gemini",
        "ollma": "ollama",
    }
    return aliases.get(normalized, normalized)


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "SupplyLens AI")
    app_env: str = os.getenv("APP_ENV", "development")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    secret_key: str = os.getenv("SECRET_KEY", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_exp_minutes: int = int(os.getenv("JWT_EXP_MINUTES", "90"))
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./supplylens_dev.db")
    redis_url: str = os.getenv("REDIS_URL", "")
    render_external_url: str = os.getenv("RENDER_EXTERNAL_URL", "").rstrip("/")
    frontend_url: str = os.getenv("FRONTEND_URL", "").rstrip("/")
    cors_allow_origins: tuple[str, ...] = _split_csv(os.getenv("CORS_ALLOW_ORIGINS", ""))
    llm_provider: str = _normalize_provider(os.getenv("LLM_PROVIDER", "gemini"))
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    llm_max_retries: int = int(os.getenv("LLM_MAX_RETRIES", "2"))
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    rate_limit_requests: int = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
    rate_limit_window_seconds: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    enable_prediction_logging: bool = _get_bool("ENABLE_PREDICTION_LOGGING", True)
    enable_db_persistence: bool = _get_bool("ENABLE_DB_PERSISTENCE", True)
    show_demo_password_hints: bool = _get_bool("SHOW_DEMO_PASSWORD_HINTS", False)
    demo_admin_password: str = os.getenv("DEMO_ADMIN_PASSWORD", "")
    demo_superuser_password: str = os.getenv("DEMO_SUPERUSER_PASSWORD", "")
    demo_carrier_password: str = os.getenv("DEMO_CARRIER_PASSWORD", "")
    demo_field_password: str = os.getenv("DEMO_FIELD_PASSWORD", "")
    demo_user_password: str = os.getenv("DEMO_USER_PASSWORD", "")

    @property
    def allowed_origins(self) -> list[str]:
        explicit = list(self.cors_allow_origins)
        inferred = [origin for origin in (self.frontend_url, self.render_external_url) if origin]

        local_dev = []
        if self.app_env != "production":
            local_dev = [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]

        ordered: list[str] = []
        for origin in [*explicit, *inferred, *local_dev]:
            normalized = origin.rstrip("/")
            if normalized and normalized not in ordered:
                ordered.append(normalized)
        return ordered


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    if settings.secret_key:
        return settings

    if settings.app_env == "production":
        raise ValueError("SECRET_KEY must be set in production")

    os.environ["SECRET_KEY"] = token_urlsafe(32)
    return Settings()
