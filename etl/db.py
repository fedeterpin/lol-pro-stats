"""Helpers de SQLite: conexión, aplicación de esquema, coerción y upsert."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from etl import config

_TRUTHY = {"1", "yes", "true", "y", "t"}
_FALSY = {"0", "no", "false", "n", "f"}


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    return conn


def apply_schema(conn: sqlite3.Connection, schema_path: Path | None = None) -> None:
    sql = (schema_path or config.SCHEMA_PATH).read_text(encoding="utf-8")
    conn.executescript(sql)
    conn.commit()


def _coerce_value(spec: config.TableSpec, field: str, raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if field in spec.bool_fields:
        low = s.lower()
        if low in _TRUTHY:
            return 1
        if low in _FALSY or s == "":
            return 0 if s != "" else None
        return None
    if s == "":
        return None
    if field in spec.int_fields:
        try:
            return int(float(s))  # tolera "3" y "3.0"
        except ValueError:
            return None
    if field in spec.float_fields:
        try:
            return float(s)
        except ValueError:
            return None
    return s


def coerce_row(spec: config.TableSpec, row: dict) -> tuple:
    return tuple(_coerce_value(spec, f, row.get(f)) for f in spec.fields)


def upsert_rows(conn: sqlite3.Connection, spec: config.TableSpec, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = ", ".join(spec.fields)
    placeholders = ", ".join("?" for _ in spec.fields)
    sql = f"INSERT OR REPLACE INTO {spec.name} ({cols}) VALUES ({placeholders})"
    data = [coerce_row(spec, r) for r in rows]
    conn.executemany(sql, data)
    conn.commit()
    return len(data)


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT OR REPLACE INTO etl_meta (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
