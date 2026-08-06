"""Resolve a MAC address to a display-ready manufacturer name.

WGIP uses manufacturer information already supplied by Kismet first. When
Kismet does not provide a usable value, this module calls the public
MACLookup.app API using only the three-byte OUI prefix. Results are cached
in-process so the same OUI is not sent repeatedly during one import.

Locally administered MAC addresses are never sent to the API because their
prefix cannot reliably identify the physical device manufacturer.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from functools import lru_cache
from typing import Any, Optional
from urllib import error, parse, request


UNKNOWN_MANUFACTURER = "Unknown Manufacturer"
PRIVATE_RANDOMIZED_MAC = "Private/Randomized MAC"
UNKNOWN_RANDOMIZED_MANUFACTURER = "Unknown Manufacturer (Randomized MAC)"
POSSIBLE_RANDOMIZED_SUFFIX = " (Possible — Randomized MAC)"

DEFAULT_API_URL_TEMPLATE = "https://api.maclookup.app/v2/macs/{mac}"
DEFAULT_API_TIMEOUT_SECONDS = 4.0
MINIMUM_REQUEST_INTERVAL_SECONDS = 0.11
FAILURES_BEFORE_CIRCUIT_BREAK = 3
CIRCUIT_BREAK_SECONDS = 60.0

_MAC_HEX_PATTERN = re.compile(r"^[0-9A-F]{12}$")
_MISSING_MANUFACTURER_VALUES = {
    "",
    "-",
    "n/a",
    "na",
    "none",
    "null",
    "unknown",
    "unknown manufacturer",
    "unknown vendor",
    "(unknown)",
}

_RANDOMIZED_ONLY_VALUES = {
    "private",
    "private/randomized mac",
    "private address",
    "private mac",
    "randomized",
    "randomized mac",
    "random mac",
    "locally administered",
    "locally administered mac",
    "unknown manufacturer (randomized mac)",
}

_request_lock = threading.Lock()
_failure_lock = threading.Lock()
_last_request_started_at = 0.0
_consecutive_failures = 0
_circuit_open_until = 0.0


def normalize_mac(value: Any) -> Optional[str]:
    """Return a colon-separated uppercase EUI-48 value, or None."""

    if value is None:
        return None

    compact = re.sub(r"[^0-9A-Fa-f]", "", str(value))

    if not _MAC_HEX_PATTERN.fullmatch(compact.upper()):
        return None

    compact = compact.upper()
    return ":".join(compact[index : index + 2] for index in range(0, 12, 2))


def is_locally_administered(value: Any) -> bool:
    """Return True when the U/L bit marks the MAC as locally administered."""

    normalized = normalize_mac(value)

    if not normalized:
        return False

    first_octet = int(normalized[0:2], 16)
    return bool(first_octet & 0b00000010)


def clean_manufacturer(value: Any) -> Optional[str]:
    """Normalize an existing Kismet/API manufacturer value."""

    if value is None:
        return None

    cleaned = str(value).strip()

    if cleaned.lower() in _MISSING_MANUFACTURER_VALUES:
        return None

    return cleaned


def is_possible_randomized_manufacturer(value: Any) -> bool:
    """Return True for a manufacturer explicitly marked as an uncertain clue."""

    cleaned = clean_manufacturer(value)
    return bool(
        cleaned
        and cleaned.lower().endswith(POSSIBLE_RANDOMIZED_SUFFIX.lower())
    )


def _is_randomized_only_label(value: Any) -> bool:
    cleaned = clean_manufacturer(value)
    return bool(cleaned and cleaned.lower() in _RANDOMIZED_ONLY_VALUES)


def _api_enabled() -> bool:
    value = os.getenv("WGIP_MAC_LOOKUP_ENABLED", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _api_timeout_seconds() -> float:
    raw_value = os.getenv(
        "WGIP_MAC_LOOKUP_TIMEOUT_SECONDS",
        str(DEFAULT_API_TIMEOUT_SECONDS),
    )

    try:
        return max(0.5, min(float(raw_value), 15.0))
    except (TypeError, ValueError):
        return DEFAULT_API_TIMEOUT_SECONDS


def _wait_for_rate_limit_slot() -> None:
    global _last_request_started_at

    with _request_lock:
        now = time.monotonic()
        remaining = (
            MINIMUM_REQUEST_INTERVAL_SECONDS
            - (now - _last_request_started_at)
        )

        if remaining > 0:
            time.sleep(remaining)

        _last_request_started_at = time.monotonic()


def _circuit_is_open() -> bool:
    with _failure_lock:
        return time.monotonic() < _circuit_open_until


def _record_api_success() -> None:
    global _consecutive_failures
    global _circuit_open_until

    with _failure_lock:
        _consecutive_failures = 0
        _circuit_open_until = 0.0


def _record_api_failure() -> None:
    global _consecutive_failures
    global _circuit_open_until

    with _failure_lock:
        _consecutive_failures += 1

        if _consecutive_failures >= FAILURES_BEFORE_CIRCUIT_BREAK:
            _circuit_open_until = time.monotonic() + CIRCUIT_BREAK_SECONDS


@lru_cache(maxsize=65536)
def lookup_maclookup_api(mac_prefix: str) -> Optional[str]:
    """Look up one normalized three-byte OUI prefix using MACLookup.app.

    Network and API failures intentionally return None so imports continue.
    """

    if not _api_enabled():
        return None

    if _circuit_is_open():
        return None

    url_template = os.getenv(
        "WGIP_MAC_LOOKUP_URL",
        DEFAULT_API_URL_TEMPLATE,
    ).strip()

    if "{mac}" not in url_template:
        return None

    encoded_mac = parse.quote(mac_prefix, safe="")
    url = url_template.format(mac=encoded_mac)

    api_request = request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "WGIP/0.1 MAC manufacturer lookup",
        },
        method="GET",
    )

    try:
        _wait_for_rate_limit_slot()

        with request.urlopen(
            api_request,
            timeout=_api_timeout_seconds(),
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (
        error.HTTPError,
        error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        OSError,
        ValueError,
    ):
        _record_api_failure()
        return None

    if not isinstance(payload, dict):
        _record_api_failure()
        return None

    _record_api_success()

    if payload.get("isRand") is True or payload.get("isPrivate") is True:
        return PRIVATE_RANDOMIZED_MAC

    if payload.get("success") is False or payload.get("found") is False:
        return None

    return clean_manufacturer(
        payload.get("company")
        or payload.get("companyName")
        or payload.get("vendor")
        or payload.get("organization")
    )


def resolve_manufacturer(
    mac_address: Any,
    preferred_manufacturer: Any = None,
) -> str:
    """Return a non-empty manufacturer label suitable for storage/display."""

    preferred = clean_manufacturer(preferred_manufacturer)
    normalized_mac = normalize_mac(mac_address)

    if not normalized_mac:
        return preferred or UNKNOWN_MANUFACTURER

    if is_locally_administered(normalized_mac):
        if is_possible_randomized_manufacturer(preferred):
            return preferred

        if preferred and not _is_randomized_only_label(preferred):
            return f"{preferred}{POSSIBLE_RANDOMIZED_SUFFIX}"

        return UNKNOWN_RANDOMIZED_MANUFACTURER

    if preferred:
        return preferred

    # The manufacturer is determined by the OUI, so the unique device portion
    # of the MAC address never needs to leave WGIP.
    oui_prefix = normalized_mac[:8]
    return lookup_maclookup_api(oui_prefix) or UNKNOWN_MANUFACTURER
