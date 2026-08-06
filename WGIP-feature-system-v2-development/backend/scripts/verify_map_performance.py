"""Verify the optimized General Map endpoints against the WGIP database."""

from __future__ import annotations

import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from app.db.session import SessionLocal
except ImportError:
    from app.db.database import SessionLocal

from app.api.routes.map_data import get_map_points, get_map_summary
from app.main import app


def collect_route_paths(routes) -> set[str]:
    """Collect flat and FastAPI 0.137+ router-tree paths."""

    paths: set[str] = set()
    pending = list(routes)
    visited = set()

    while pending:
        route = pending.pop()
        route_identity = id(route)

        if route_identity in visited:
            continue

        visited.add(route_identity)

        path = getattr(route, "path", "")

        if path:
            paths.add(path)

        nested_routes = getattr(route, "routes", None)

        if nested_routes:
            pending.extend(list(nested_routes))

        original_router = getattr(route, "original_router", None)

        if original_router is not None:
            pending.append(original_router)

    return paths


def padded_bounds(summary):
    bounds = summary.get("bounds") or {}
    south = bounds.get("south")
    north = bounds.get("north")
    west = bounds.get("west")
    east = bounds.get("east")

    if None in (south, north, west, east):
        return 4.0, 22.0, 116.0, 127.0

    south = float(south)
    north = float(north)
    west = float(west)
    east = float(east)
    latitude_padding = max((north - south) * 0.02, 0.0001)
    longitude_padding = max((east - west) * 0.02, 0.0001)

    return (
        max(-90.0, south - latitude_padding),
        min(90.0, north + latitude_padding),
        max(-180.0, west - longitude_padding),
        min(180.0, east + longitude_padding),
    )


def main() -> None:
    registered_paths = collect_route_paths(app.router.routes)
    required_paths = {"/map-data/summary", "/map-data/points"}
    missing_paths = required_paths - registered_paths

    if missing_paths:
        raise RuntimeError(
            "Map API routes are not registered: " + ", ".join(sorted(missing_paths))
        )

    db = SessionLocal()

    try:
        summary = get_map_summary(db=db)
        south, north, west, east = padded_bounds(summary)
        result = get_map_points(
            south=south,
            north=north,
            west=west,
            east=east,
            record_type="all",
            limit=100,
            db=db,
        )

        items = result.get("items", [])
        viewport_total = int(result.get("viewport_total") or 0)

        if len(items) > 100:
            raise RuntimeError("The map endpoint exceeded the requested row limit.")

        if viewport_total < len(items):
            raise RuntimeError("The map endpoint returned inconsistent record counts.")

        if items:
            required_fields = {
                "row_id",
                "record_type",
                "identifier",
                "latitude",
                "longitude",
            }
            missing_fields = required_fields - set(items[0])

            if missing_fields:
                raise RuntimeError(
                    "Map point is missing fields: " + ", ".join(sorted(missing_fields))
                )

        print("WGIP GENERAL MAP PERFORMANCE VERIFICATION")
        print("=" * 62)
        print("Total mapped records     :", summary.get("total_mapped", 0))
        print("Mapped Wi-Fi records     :", summary.get("wifi_mapped", 0))
        print("Mapped device records    :", summary.get("device_mapped", 0))
        print("Mapped locations         :", summary.get("location_count", 0))
        print("Scans on map             :", summary.get("scans_on_map", 0))
        print("Viewport records         :", viewport_total)
        print("Rows returned for test   :", len(items))
        print("Requested row limit      : 100")
        print("Map API routes registered: PASS")
        print("")
        print("RESULT: VIEWPORT MAP API CONFIRMED")
    finally:
        db.close()


if __name__ == "__main__":
    main()
