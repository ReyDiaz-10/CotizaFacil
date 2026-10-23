"""Private Supabase REST/Storage adapter. The service-role key stays on the server."""
from __future__ import annotations

import os
from urllib.parse import quote
from typing import Any

import httpx

TABLE = "cotizafacil_store"
BUCKET = "cotizafacil-private"


def configured() -> bool:
    return bool(os.getenv("SUPABASE_URL", "").strip() and os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())


def _config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor.")
    return url, key


def _headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def get_json(key_name: str, default: Any = None) -> Any:
    url, key = _config()
    response = httpx.get(
        f"{url}/rest/v1/{TABLE}",
        params={"key": f"eq.{key_name}", "select": "value", "limit": "1"},
        headers=_headers(key),
        timeout=12.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase no pudo leer la configuración o los datos (HTTP {response.status_code}).")
    rows = response.json()
    return rows[0]["value"] if rows else default


def set_json(key_name: str, value: Any) -> None:
    url, key = _config()
    headers = {**_headers(key), "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
    response = httpx.post(
        f"{url}/rest/v1/{TABLE}?on_conflict=key",
        json={"key": key_name, "value": value},
        headers=headers,
        timeout=12.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase no pudo guardar los datos (HTTP {response.status_code}).")


def upload_file(path: str, content: bytes, content_type: str) -> None:
    url, key = _config()
    object_path = quote(path.strip("/"), safe="/")
    headers = {**_headers(key), "Content-Type": content_type, "x-upsert": "true"}
    response = httpx.post(
        f"{url}/storage/v1/object/{BUCKET}/{object_path}",
        content=content,
        headers=headers,
        timeout=30.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage no pudo guardar el archivo (HTTP {response.status_code}).")


def download_file(path: str) -> bytes:
    url, key = _config()
    object_path = quote(path.strip("/"), safe="/")
    response = httpx.get(
        f"{url}/storage/v1/object/{BUCKET}/{object_path}",
        headers=_headers(key),
        timeout=30.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage no pudo leer el archivo (HTTP {response.status_code}).")
    return response.content
