from __future__ import annotations

import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path, PurePosixPath
from threading import Lock
from uuid import uuid4

from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .models import SolicitudEquipoArchivo
from .nextcloud import NextcloudError, storage


class LocalFileError(RuntimeError):
    pass


class LocalFileCache:
    def __init__(self) -> None:
        self.root = Path(settings.local_file_cache_dir).expanduser().resolve()

    def ensure_ready(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, relative_path: str) -> Path:
        normalized = PurePosixPath(relative_path)
        if normalized.is_absolute() or ".." in normalized.parts:
            raise LocalFileError("La ruta local del archivo no es válida.")
        target = self.root.joinpath(*normalized.parts).resolve()
        if target != self.root and self.root not in target.parents:
            raise LocalFileError("La ruta local sale del directorio permitido.")
        return target

    def write(self, relative_path: str, content: bytes) -> None:
        target = self._path(relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_bytes(content)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def read(self, relative_path: str) -> bytes:
        target = self._path(relative_path)
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise LocalFileError("La copia local del archivo no está disponible.") from exc

    def delete(self, relative_path: str | None) -> None:
        if not relative_path:
            return
        self._path(relative_path).unlink(missing_ok=True)

    def valid_content(self, relative_path: str | None, expected_sha256: str) -> bytes | None:
        if not relative_path:
            return None
        try:
            content = self.read(relative_path)
        except LocalFileError:
            return None
        return content if sha256(content).hexdigest() == expected_sha256 else None


local_cache = LocalFileCache()
_sync_lock = Lock()


def sync_pending_files(limit: int = 20, force: bool = False) -> int:
    if not storage.configured or not _sync_lock.acquire(blocking=False):
        return 0
    synchronized = 0
    try:
        local_cache.ensure_ready()
        with SessionLocal() as db:
            records = db.scalars(
                select(SolicitudEquipoArchivo)
                .where(
                    SolicitudEquipoArchivo.estado_almacenamiento.in_(
                        ("PENDIENTE", "ERROR")
                    ),
                    SolicitudEquipoArchivo.eliminado_en.is_(None),
                )
                .order_by(
                    SolicitudEquipoArchivo.ultimo_intento_en.asc().nullsfirst(),
                    SolicitudEquipoArchivo.creado_en,
                )
                .limit(limit)
            ).all()
            for record in records:
                now = datetime.now(timezone.utc)
                attempts = record.intentos_sincronizacion or 0
                if not force and record.ultimo_intento_en is not None:
                    elapsed = (now - record.ultimo_intento_en).total_seconds()
                    delay = min(3600, 60 * (2 ** min(attempts, 6)))
                    if elapsed < delay:
                        continue
                record.ultimo_intento_en = now
                record.intentos_sincronizacion = attempts + 1
                content = local_cache.valid_content(record.ruta_local, record.sha256)
                if content is None:
                    record.estado_almacenamiento = "ERROR"
                    record.ultimo_error_sincronizacion = (
                        "La copia local no existe o no coincide con su hash SHA-256."
                    )
                    db.commit()
                    continue
                try:
                    remote = storage.upload(
                        record.ruta_remota, content, record.mime_type
                    )
                except NextcloudError as exc:
                    record.estado_almacenamiento = "ERROR"
                    record.ultimo_error_sincronizacion = str(exc)[:2000]
                    db.commit()
                    continue
                record.nextcloud_file_id = remote["file_id"]
                record.nextcloud_etag = remote["etag"]
                record.estado_almacenamiento = "SINCRONIZADO"
                record.ultimo_error_sincronizacion = None
                record.sincronizado_en = now
                db.commit()
                synchronized += 1
    finally:
        _sync_lock.release()
    return synchronized
