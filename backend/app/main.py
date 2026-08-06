import importlib
import pkgutil

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.client_observations import router as client_observations_router
from app.api.important_signals import router as important_signals_router
from app.api.scan_results import router as scan_results_router
from app.api.device_link_analysis import router as device_link_analysis_router
from app.api.kismet_imports import router as kismet_imports_router
from app.api.kismet_csv_imports import router as kismet_csv_imports_router
from app.api.scan_reports import router as scan_reports_router
from app.api.device_reports import router as device_reports_router
from app.api.wifi_reports import router as wifi_reports_router
from app.api.deauth import router as deauth_router

app = FastAPI(
    title="WGIP API",
    description="Wireless Geospatial Intelligence Platform API",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "WGIP API is running",
        "modules": [
            "existing_routes",
            "client_observations",
            "important_signals",
            "scan_results",
            "device_link_analysis",
        ],
    }


def include_existing_route_modules() -> None:
    import app.api.routes as routes_package

    for module_info in pkgutil.iter_modules(routes_package.__path__):
        module_name = module_info.name

        if module_info.ispkg:
            continue

        module = importlib.import_module(f"app.api.routes.{module_name}")
        router = getattr(module, "router", None)

        if router is not None:
            app.include_router(router)


include_existing_route_modules()

app.include_router(client_observations_router)
app.include_router(important_signals_router)
app.include_router(scan_results_router)
app.include_router(device_link_analysis_router)
app.include_router(kismet_imports_router)
app.include_router(kismet_csv_imports_router)
app.include_router(scan_reports_router)
app.include_router(device_reports_router)
app.include_router(wifi_reports_router)
app.include_router(deauth_router)