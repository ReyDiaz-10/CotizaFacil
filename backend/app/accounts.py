"""Local account and workspace storage for the CotizaFácil prototype."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from app import cloud

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
FREE_USERS_FILE = DATA_DIR / "free_users.json"
SUBSCRIBERS_FILE = DATA_DIR / "subscribed_users.json"
WORKSPACES_DIR = DATA_DIR / "workspaces"
PAYMENT_SETTINGS_FILE = DATA_DIR / "payment_settings.json"
CONTACT_SETTINGS_FILE = DATA_DIR / "contact_settings.json"
AI_SETTINGS_FILE = DATA_DIR / "ai_settings.json"
AUDIT_LOG_FILE = DATA_DIR / "audit_log.jsonl"
NOTIFICATIONS_FILE = DATA_DIR / "notifications.json"
_LOCK = threading.RLock()


def _ensure_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    if cloud.configured():
        return
    for path in (FREE_USERS_FILE, SUBSCRIBERS_FILE):
        if not path.exists():
            path.write_text("[]", encoding="utf-8")


def _storage_key(path: Path) -> str:
    return path.relative_to(DATA_DIR).as_posix()


def _read_value(path: Path, default: Any) -> Any:
    _ensure_files()
    if cloud.configured():
        return cloud.get_json(_storage_key(path), default)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value
    except (OSError, json.JSONDecodeError):
        return default


def _write_value(path: Path, value: Any) -> None:
    _ensure_files()
    if cloud.configured():
        cloud.set_json(_storage_key(path), value)
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def _read(path: Path) -> list[dict[str, Any]]:
    value = _read_value(path, [])
    return value if isinstance(value, list) else []


def _write(path: Path, value: list[dict[str, Any]]) -> None:
    _ensure_files()
    if cloud.configured():
        cloud.set_json(_storage_key(path), value)
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def all_users() -> list[dict[str, Any]]:
    with _LOCK:
        return _read(FREE_USERS_FILE) + _read(SUBSCRIBERS_FILE)


def find_user(user_id: str) -> dict[str, Any] | None:
    return next((user for user in all_users() if user["id"] == user_id), None)


def find_email(email: str) -> dict[str, Any] | None:
    email = email.strip().lower()
    return next((user for user in all_users() if user.get("email") == email), None)


def find_username(username: str) -> dict[str, Any] | None:
    username = username.strip().casefold()
    return next((user for user in all_users() if user.get("username", "").casefold() == username), None)


def save_user(user: dict[str, Any]) -> None:
    with _LOCK:
        free = _read(FREE_USERS_FILE)
        paid = _read(SUBSCRIBERS_FILE)
        free = [item for item in free if item["id"] != user["id"]]
        paid = [item for item in paid if item["id"] != user["id"]]
        if user.get("plan_status") == "subscribed":
            paid.append(user)
        else:
            free.append(user)
        _write(FREE_USERS_FILE, free)
        _write(SUBSCRIBERS_FILE, paid)


def create_user(username: str, first_name: str, password: str, trade: str, email: str = "") -> dict[str, Any]:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1).hex()
    user = {
        "id": secrets.token_urlsafe(12),
        "first_name": first_name.strip(),
        "username": username.strip(),
        "business": "",
        "email": email.strip().lower(),
        "password_hash": f"scrypt${salt.hex()}${password_hash}",
        "trade": trade.strip(),
        "role": "technician",
        "active": True,
        "plan_status": "free",
        "subscription_request": "none",
        "payment_reference": "",
        "features": {"ai_quotes": True, "ai_logo": False, "sms_reminders": False, "job_opportunities": False},
        "created_at": int(time.time()),
    }
    save_user(user)
    return user


def ensure_demo_user() -> None:
    username = os.getenv("DEMO_TECH_USERNAME", "").strip()
    password = os.getenv("DEMO_TECH_PASSWORD", "")
    if not username or not password or find_username(username):
        return
    create_user(
        username=username,
        first_name=os.getenv("DEMO_TECH_FIRST_NAME", "Allan").strip() or "Allan",
        password=password,
        trade=os.getenv("DEMO_TECH_TRADE", "Plomería").strip() or "Plomería",
    )


def verify_password(user: dict[str, Any], password: str) -> bool:
    try:
        algorithm, salt_hex, expected = user["password_hash"].split("$", 2)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (KeyError, ValueError):
        return False


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    result = {key: user.get(key) for key in (
        "id", "username", "first_name", "business", "email", "trade", "role", "active",
        "plan_status", "subscription_request", "features", "logo_file", "logo_prompt",
        "subscription_expires_at", "subscription_days_left", "receipt_sent_at", "renewal_scheduled"
    )}
    expires_at = user.get("subscription_expires_at")
    result["subscription_days_left"] = max(0, math.ceil((int(expires_at) - time.time()) / 86400)) if expires_at and user.get("plan_status") == "subscribed" else 0
    return result


def _secret() -> bytes:
    configured = os.getenv("AUTH_SECRET", "").strip()
    if configured:
        return configured.encode("utf-8")
    if cloud.configured():
        secret = cloud.get_json("_internal/auth.secret")
        if not secret:
            secret = secrets.token_urlsafe(48)
            cloud.set_json("_internal/auth.secret", secret)
        return str(secret).encode("utf-8")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_path = DATA_DIR / "auth.secret"
    if not key_path.exists():
        key_path.write_bytes(secrets.token_bytes(48))
    return key_path.read_bytes()


def issue_session(user_id: str) -> str:
    expiry = int(time.time()) + 60 * 60 * 24 * 14
    body = f"{user_id}.{expiry}".encode("utf-8")
    signature = hmac.new(_secret(), body, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(body + b"." + signature).decode("ascii").rstrip("=")


def verify_session(token: str) -> str | None:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        if len(raw) < 34 or raw[-33:-32] != b".":
            return None
        body, signature = raw[:-33], raw[-32:]
        expected = hmac.new(_secret(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        user_id, expiry = body.decode("utf-8").rsplit(".", 1)
        return user_id if int(expiry) > int(time.time()) else None
    except (ValueError, UnicodeDecodeError):
        return None


def revoke_user_sessions(user_id: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "revoked_sessions.json"
    value = _read_value(path, [])
    if user_id not in value:
        value.append(user_id)
    _write_value(path, value)


def sessions_revoked(user_id: str) -> bool:
    return user_id in _read_value(DATA_DIR / "revoked_sessions.json", [])


def restore_user_sessions(user_id: str) -> None:
    path = DATA_DIR / "revoked_sessions.json"
    value = _read_value(path, [])
    _write_value(path, [item for item in value if item != user_id])


def workspace_path(user_id: str) -> Path:
    WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
    return WORKSPACES_DIR / f"{user_id}.json"


def read_workspace(user_id: str) -> dict[str, Any]:
    path = workspace_path(user_id)
    data = _read_value(path, {"jobs": []})
    return data if isinstance(data, dict) and isinstance(data.get("jobs"), list) else {"jobs": []}


def write_workspace(user_id: str, data: dict[str, Any]) -> None:
    path = workspace_path(user_id)
    if cloud.configured():
        cloud.set_json(_storage_key(path), data)
        return
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def store_file(relative_path: str, content: bytes, content_type: str) -> str:
    normalized = Path(relative_path)
    if normalized.is_absolute() or ".." in normalized.parts:
        raise ValueError("Ruta de archivo no válida.")
    key = normalized.as_posix()
    if cloud.configured():
        cloud.upload_file(key, content, content_type)
        return key
    path = (DATA_DIR / normalized).resolve()
    if DATA_DIR.resolve() not in path.parents:
        raise ValueError("Ruta de archivo no válida.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return key


def read_file(relative_path: str) -> bytes:
    normalized = Path(relative_path)
    if normalized.is_absolute() or ".." in normalized.parts:
        raise FileNotFoundError("No se encontró el archivo.")
    if cloud.configured():
        return cloud.download_file(normalized.as_posix())
    path = (DATA_DIR / normalized).resolve()
    if DATA_DIR.resolve() not in path.parents or not path.is_file():
        raise FileNotFoundError("No se encontró el archivo.")
    return path.read_bytes()


def quote_ids(workspace: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for job in workspace.get("jobs", []):
        for quote in job.get("quotes", []) if isinstance(job, dict) else []:
            quote_id = quote.get("id") if isinstance(quote, dict) else None
            if quote_id:
                ids.add(str(quote_id))
    return ids


def read_payment_settings() -> dict[str, Any]:
    value = _read_value(PAYMENT_SETTINGS_FILE, {})
    return value if isinstance(value, dict) else {}


def save_payment_settings(value: dict[str, Any]) -> None:
    _write_value(PAYMENT_SETTINGS_FILE, value)


def read_contact_settings() -> dict[str, Any]:
    value = _read_value(CONTACT_SETTINGS_FILE, {})
    return value if isinstance(value, dict) else {}


def save_contact_settings(value: dict[str, Any]) -> None:
    _write_value(CONTACT_SETTINGS_FILE, value)


def read_ai_settings() -> dict[str, Any]:
    value = _read_value(AI_SETTINGS_FILE, {})
    value = value if isinstance(value, dict) else {}
    env_key = os.getenv("GEMINI_API_KEY", "")
    default_provider = "gemini" if env_key else "ollama"
    return {"provider": value.get("provider", default_provider), "base_url": value.get("base_url", "https://generativelanguage.googleapis.com/v1beta/openai" if default_provider == "gemini" else "http://localhost:11434"), "model": value.get("model", os.getenv("GEMINI_MODEL", "gemini-3.8-flash") if default_provider == "gemini" else "qwen3:4b"), "has_api_key": bool(value.get("api_key") or env_key)}


def read_ai_runtime_settings() -> dict[str, Any]:
    """Return private provider credentials for backend calls; never send this dict to the browser."""
    value = _read_value(AI_SETTINGS_FILE, {})
    value = value if isinstance(value, dict) else {}
    public = read_ai_settings()
    return {**public, "api_key": value.get("api_key") or os.getenv("GEMINI_API_KEY", "")}


def save_ai_settings(value: dict[str, Any]) -> None:
    current = _read_value(AI_SETTINGS_FILE, {})
    secret = value.get("api_key") if value.get("api_key") is not None else current.get("api_key", "")
    settings = {"provider": value.get("provider", "ollama"), "base_url": value.get("base_url", "http://localhost:11434"), "model": value.get("model", "qwen3:4b"), "api_key": secret or ""}
    _write_value(AI_SETTINGS_FILE, settings)


def record_audit(actor: dict[str, Any], action: str, target_id: str = "", details: str = "") -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    record = {"timestamp": int(time.time()), "actor_id": actor.get("id", ""), "actor": actor.get("username") or actor.get("first_name") or "admin", "action": action, "target_id": target_id, "details": details[:300]}
    try:
        with _LOCK:
            records = read_audit(9999)
            records.insert(0, record)
            if cloud.configured():
                cloud.set_json(_storage_key(AUDIT_LOG_FILE), records[:9999])
            else:
                temporary = AUDIT_LOG_FILE.with_suffix(".jsonl.tmp")
                temporary.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in reversed(records)), encoding="utf-8")
                os.replace(temporary, AUDIT_LOG_FILE)
    except OSError:
        return


def read_audit(limit: int = 200) -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if cloud.configured():
        value = cloud.get_json(_storage_key(AUDIT_LOG_FILE), [])
        return value[:limit] if isinstance(value, list) else []
    try:
        lines = AUDIT_LOG_FILE.read_text(encoding="utf-8").splitlines()[-limit:]
        events = []
        for line in reversed(lines):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events
    except OSError:
        return []


def add_notification(audience: str, title: str, message: str, user_id: str = "") -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        items = _read_value(NOTIFICATIONS_FILE, [])
        item = {"id": secrets.token_urlsafe(9), "audience": audience, "user_id": user_id, "title": title[:120], "message": message[:500], "created_at": int(time.time()), "read": False}
        items.append(item)
        _write_value(NOTIFICATIONS_FILE, items[-1000:])
    return item


def get_notifications(audience: str, user_id: str = "", limit: int = 100) -> list[dict[str, Any]]:
    items = _read_value(NOTIFICATIONS_FILE, [])
    return [item for item in reversed(items) if item.get("audience") == audience and (audience == "admin" or item.get("user_id") == user_id)][:limit] if isinstance(items, list) else []


def mark_notification_read(notification_id: str, audience: str, user_id: str = "") -> bool:
    if not cloud.configured() and not NOTIFICATIONS_FILE.exists():
        return False
    with _LOCK:
        items = _read_value(NOTIFICATIONS_FILE, [])
        if not isinstance(items, list):
            return False
        found = False
        for item in items:
            if item.get("id") == notification_id and item.get("audience") == audience and (audience == "admin" or item.get("user_id") == user_id):
                item["read"] = True
                found = True
        if found:
            _write_value(NOTIFICATIONS_FILE, items)
        return found
