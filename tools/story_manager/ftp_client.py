"""FTP helpers for Futuremagic Story Manager."""

from __future__ import annotations

from ftplib import FTP, error_perm
from io import BytesIO


class FtpClient:
    def __init__(
        self,
        host: str,
        user: str,
        password: str,
        remote_root: str = "/webseiten/",
    ) -> None:
        if not password:
            raise ValueError("FTP password is required")
        self.host = host
        self.user = user
        self.password = password
        self.remote_root = self._normalize_dir(remote_root)

    @staticmethod
    def _normalize_dir(path: str) -> str:
        if not path.startswith("/"):
            path = f"/{path}"
        if not path.endswith("/"):
            path = f"{path}/"
        return path

    def _connect(self) -> FTP:
        ftp = FTP()
        ftp.connect(self.host, 21, timeout=60)
        ftp.login(self.user, self.password)
        ftp.set_pasv(True)
        return ftp

    def _abs(self, relative: str) -> str:
        rel = relative.lstrip("/")
        return f"{self.remote_root}{rel}"

    def download_text(self, relative: str) -> str | None:
        path = self._abs(relative)
        buf = BytesIO()
        with self._connect() as ftp:
            try:
                ftp.retrbinary(f"RETR {path}", buf.write)
            except error_perm as exc:
                if str(exc).startswith("550"):
                    return None
                raise
        return buf.getvalue().decode("utf-8")

    def upload_bytes(self, relative: str, data: bytes) -> None:
        path = self._abs(relative)
        parent = path.rsplit("/", 1)[0] + "/"
        with self._connect() as ftp:
            self._ensure_dir(ftp, parent)
            ftp.storbinary(f"STOR {path}", BytesIO(data))

    def upload_text(self, relative: str, text: str) -> None:
        self.upload_bytes(relative, text.encode("utf-8"))

    def delete_file(self, relative: str) -> None:
        path = self._abs(relative)
        with self._connect() as ftp:
            try:
                ftp.delete(path)
            except error_perm as exc:
                if str(exc).startswith("550"):
                    return
                raise

    def ensure_directory(self, relative_dir: str) -> None:
        path = self._abs(relative_dir)
        path = self._normalize_dir(path)
        with self._connect() as ftp:
            self._ensure_dir(ftp, path)

    @staticmethod
    def _ensure_dir(ftp: FTP, absolute_dir: str) -> None:
        parts = [p for p in absolute_dir.strip("/").split("/") if p]
        current = "/"
        for part in parts:
            current = f"{current}{part}/"
            try:
                ftp.mkd(current.rstrip("/"))
            except error_perm:
                # Already exists
                pass
