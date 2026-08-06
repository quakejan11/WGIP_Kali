"""Test WGIP's MAC manufacturer resolver from PowerShell."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.utils.mac_manufacturer import (
    POSSIBLE_RANDOMIZED_SUFFIX,
    UNKNOWN_MANUFACTURER,
    UNKNOWN_RANDOMIZED_MANUFACTURER,
    normalize_mac,
    resolve_manufacturer,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve one MAC address to a manufacturer.",
    )
    parser.add_argument(
        "mac",
        nargs="?",
        default="00:00:00:00:00:00",
        help="MAC address to look up.",
    )
    args = parser.parse_args()

    normalized = normalize_mac(args.mac)
    manufacturer = resolve_manufacturer(args.mac)

    print("Input MAC       :", args.mac)
    print("Normalized MAC  :", normalized or "Invalid MAC")
    print("Manufacturer    :", manufacturer)

    if manufacturer == UNKNOWN_RANDOMIZED_MANUFACTURER:
        print("Result          : Randomized MAC; no independent manufacturer clue was available.")
    elif manufacturer.endswith(POSSIBLE_RANDOMIZED_SUFFIX):
        print("Result          : Possible Kismet manufacturer clue; randomized MAC prevents confirmation.")
    elif manufacturer == UNKNOWN_MANUFACTURER:
        print("Result          : No manufacturer match or the lookup API was unavailable.")
    else:
        print("Result          : Manufacturer resolved successfully.")


if __name__ == "__main__":
    main()
