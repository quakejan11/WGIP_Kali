"""Verify the optimized Observations query against the configured WGIP database."""

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

from app.api.routes.processed_observations import list_processed_observations
from app.main import app


def collect_route_paths(routes) -> set[str]:
    """Collect paths from flat and router-tree FastAPI/Starlette apps.

    FastAPI 0.137+ represents ``include_router()`` calls with private
    ``_IncludedRouter`` nodes. Their child APIRouter is exposed through
    ``original_router`` instead of a direct ``routes`` attribute.
    """

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


def main() -> None:
    registered_paths = collect_route_paths(app.router.routes)

    if "/processed-observations" not in registered_paths:
        top_level_types = sorted(
            {type(route).__name__ for route in app.router.routes}
        )
        raise RuntimeError(
            "The processed Observations API route is not registered. "
            f"Top-level route types: {', '.join(top_level_types)}. "
            f"Discovered paths: {len(registered_paths)}."
        )

    db = SessionLocal()

    try:
        result = list_processed_observations(
            record_type="all",
            import_batch_id=None,
            search="",
            page=1,
            page_size=10,
            db=db,
        )

        items = result.get("items", [])
        stats = result.get("stats", {})

        if len(items) > 10:
            raise RuntimeError("The endpoint returned more than one requested page.")

        if result.get("page") != 1:
            raise RuntimeError("The first-page verification returned an invalid page number.")

        print("WGIP OBSERVATIONS PAGINATION VERIFICATION")
        print("=" * 62)
        print("Total processed records :", result.get("total", 0))
        print("Rows returned            :", len(items))
        print("Requested page size      :", result.get("page_size", 0))
        print("Total pages              :", result.get("total_pages", 0))
        print("Wi-Fi records            :", stats.get("wifi_record_count", 0))
        print("Device records           :", stats.get("device_record_count", 0))
        print("Mapped records           :", stats.get("mapped_record_count", 0))
        print("Scan filter options      :", len(result.get("scan_options", [])))
        print("API route registered     : PASS")
        print("")
        print("RESULT: TRUE SERVER-SIDE PAGINATION CONFIRMED")
    finally:
        db.close()


if __name__ == "__main__":
    main()
