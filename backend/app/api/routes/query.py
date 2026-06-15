from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.models.request_response import QueryRequest, QueryResponse, SchemaResponse
from app.services.query_pipeline import AutonomousQueryService

router = APIRouter(prefix="/query", tags=["query"])


def get_query_service(settings: Settings = Depends(get_settings)) -> AutonomousQueryService:
    return AutonomousQueryService(settings)


@router.post("", response_model=QueryResponse)
async def query_database(
    payload: QueryRequest,
    service: AutonomousQueryService = Depends(get_query_service),
) -> QueryResponse:
    return await service.run_query(payload)


@router.get("/schema", response_model=SchemaResponse)
async def inspect_schema(
    service: AutonomousQueryService = Depends(get_query_service),
) -> SchemaResponse:
    return service.get_schema()

