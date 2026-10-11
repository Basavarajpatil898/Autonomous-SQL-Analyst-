from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "ollama_model": settings.ollama_model,
        "gemini_fallback_enabled": settings.has_gemini_fallback,
    }

