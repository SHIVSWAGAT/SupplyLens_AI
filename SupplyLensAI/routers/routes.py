from fastapi import APIRouter
from models.schemas import RouteOptimizeRequest, RouteOption
from services.risk_engine import optimize_route
from services.data_generator import CITIES
from typing import List

router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.post("/optimize", response_model=List[RouteOption])
def optimize(req: RouteOptimizeRequest):
    return optimize_route(req)


@router.get("/cities")
def get_cities():
    return [
        {
            "name": c["name"],
            "lat": c["lat"],
            "lng": c["lng"],
            "region": c["region"]
        }
        for c in CITIES
    ]