"""Preview or migrate CotizaFácil's local JSON/images to private Supabase storage."""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import accounts, cloud  # noqa: E402


def collect() -> tuple[list[tuple[str, object]], list[tuple[str, bytes, str]], bool]:
    data_dir = accounts.DATA_DIR
    records: list[tuple[str, object]] = []
    files: list[tuple[str, bytes, str]] = []
    skipped_ai_key = False
    if not data_dir.is_dir():
        return records, files, skipped_ai_key
    for path in sorted(data_dir.rglob("*")):
        if not path.is_file() or path.name == "auth.secret" or path.name.endswith(".tmp"):
            continue
        key = path.relative_to(data_dir).as_posix()
        if path.suffix == ".json":
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"No se pudo leer {key}; corrige ese archivo antes de migrar.") from exc
            if key == "ai_settings.json" and isinstance(value, dict) and value.get("api_key"):
                value = {**value, "api_key": ""}
                skipped_ai_key = True
            records.append((key, value))
        elif path.suffix == ".jsonl":
            events = []
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            records.append((key, list(reversed(events))))
        else:
            content_type, _ = mimetypes.guess_type(path.name)
            if content_type not in {"image/png", "image/jpeg"}:
                continue
            files.append((key, path.read_bytes(), content_type))
    return records, files, skipped_ai_key


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Subir registros e imágenes a Supabase (acción irreversible sin restaurar una copia local).")
    args = parser.parse_args()
    if not cloud.configured():
        print("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env.", file=sys.stderr)
        return 2
    records, files, skipped_ai_key = collect()
    print(f"Vista previa: {len(records)} registros y {len(files)} imágenes privadas.")
    if skipped_ai_key:
        print("La clave de Gemini se omitirá por seguridad; vuelve a guardarla desde el panel cuando la app esté conectada a Supabase.")
    if not args.apply:
        print("No se subió nada. Revisa la vista previa; usa --apply para ejecutar la migración.")
        return 0
    for key, content, content_type in files:
        cloud.upload_file(key, content, content_type)
    for key, value in records:
        cloud.set_json(key, value)
    print("Migración terminada. Conserva una copia local de backend/data hasta verificar cuentas, trabajos, notificaciones e imágenes en la app publicada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
