from pathlib import PurePosixPath
from urllib.parse import quote

import httpx

from .config import settings


class NextcloudError(RuntimeError):
    pass


class NextcloudStorage:
    def __init__(self):
        self.base_url = settings.nextcloud_webdav_url.rstrip("/")
        self.auth = (settings.nextcloud_username, settings.nextcloud_app_password)
        self.headers = {"X-Requested-With": "XMLHttpRequest"}

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.auth[0] and self.auth[1])

    def _url(self, path: str) -> str:
        normalized = str(PurePosixPath(path))
        encoded = "/".join(quote(part, safe="") for part in normalized.split("/"))
        return f"{self.base_url}/{encoded}"

    def _client(self) -> httpx.Client:
        if not self.configured:
            raise NextcloudError("Nextcloud no está configurado en backend/.env.")
        return httpx.Client(
            auth=self.auth,
            headers=self.headers,
            timeout=httpx.Timeout(60.0, connect=15.0),
            follow_redirects=True,
        )

    def ensure_directory(self, path: str) -> None:
        parts = PurePosixPath(path).parts
        with self._client() as client:
            for index in range(1, len(parts) + 1):
                current = "/".join(parts[:index])
                response = client.request("MKCOL", self._url(current))
                if response.status_code not in {201, 405}:
                    raise NextcloudError(
                        f"Nextcloud rechazó la creación de carpetas (HTTP {response.status_code})."
                    )

    def upload(self, path: str, content: bytes, mime_type: str) -> dict[str, str | None]:
        parent = str(PurePosixPath(path).parent)
        self.ensure_directory(parent)
        with self._client() as client:
            response = client.put(
                self._url(path),
                content=content,
                headers={**self.headers, "Content-Type": mime_type},
            )
        if response.status_code not in {201, 204}:
            raise NextcloudError(
                f"Nextcloud rechazó la subida del archivo (HTTP {response.status_code})."
            )
        return {
            "etag": response.headers.get("etag") or response.headers.get("oc-etag"),
            "file_id": response.headers.get("oc-fileid"),
        }

    def download(self, path: str) -> bytes:
        with self._client() as client:
            response = client.get(self._url(path))
        if response.status_code == 404:
            raise NextcloudError("El archivo ya no existe en Nextcloud.")
        if response.status_code != 200:
            raise NextcloudError(
                f"Nextcloud rechazó la descarga (HTTP {response.status_code})."
            )
        return response.content

    def delete(self, path: str) -> None:
        with self._client() as client:
            response = client.delete(self._url(path))
        if response.status_code not in {204, 404}:
            raise NextcloudError(
                f"Nextcloud rechazó la eliminación (HTTP {response.status_code})."
            )


storage = NextcloudStorage()
