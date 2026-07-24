from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=True)


def _lista(nombre: str, predeterminado: str) -> list[str]:
    return [
        valor.strip()
        for valor in os.getenv(nombre, predeterminado).split(",")
        if valor.strip()
    ]


@dataclass(frozen=True)
class Settings:
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "5432"))
    db_name: str = os.getenv("DB_NAME", "inventario_db")
    db_user: str = os.getenv("DB_USER", "inventario_importador")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_sslmode: str = os.getenv("DB_SSLMODE", "prefer")
    api_host: str = os.getenv("API_HOST", "127.0.0.1")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    frontend_origins: tuple[str, ...] = tuple(
        _lista(
            "FRONTEND_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        )
    )
    auth_enabled: bool = os.getenv("AUTH_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "si",
    }
    nextcloud_webdav_url: str = os.getenv("NEXTCLOUD_WEBDAV_URL", "").strip()
    nextcloud_username: str = os.getenv("NEXTCLOUD_USERNAME", "").strip()
    nextcloud_app_password: str = os.getenv("NEXTCLOUD_APP_PASSWORD", "")
    local_file_cache_dir: str = (
        os.getenv("LOCAL_FILE_CACHE_DIR", "").strip()
        or str(BASE_DIR / "data" / "solicitudes")
    )
    file_sync_interval_seconds: int = max(
        15, int(os.getenv("FILE_SYNC_INTERVAL_SECONDS", "60"))
    )


settings = Settings()
