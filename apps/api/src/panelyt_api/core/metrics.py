from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from threading import Lock

_lock = Lock()
_counters: Counter[str] = Counter()


def increment(name: str, value: int = 1, **labels: str) -> int:
    key = _format_key(name, labels)
    with _lock:
        _counters[key] += value
        return _counters[key]


def snapshot() -> dict[str, int]:
    with _lock:
        return dict(_counters)


def reset() -> None:
    with _lock:
        _counters.clear()


def _format_key(name: str, labels: Mapping[str, str]) -> str:
    if not labels:
        return name
    parts = [f"{key}={value}" for key, value in sorted(labels.items())]
    return f"{name}|{','.join(parts)}"


__all__ = ["increment", "reset", "snapshot"]
