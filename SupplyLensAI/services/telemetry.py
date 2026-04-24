import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter

from fastapi import Request

from config import BASE_DIR, get_settings


LOGGER_NAME = "supplylens"


def setup_logging() -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return logger

    settings = get_settings()
    log_dir = BASE_DIR / "logs"
    log_dir.mkdir(exist_ok=True)
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    file_handler = RotatingFileHandler(log_dir / "platform.log", maxBytes=1_000_000, backupCount=3)
    file_handler.setFormatter(formatter)

    logger.addHandler(stream_handler)
    logger.addHandler(file_handler)
    logger.propagate = False
    logger.info("logging_initialized env=%s", settings.app_env)
    return logger


LOGGER = setup_logging()


def log_prediction(event_type: str, payload: dict) -> None:
    if not get_settings().enable_prediction_logging:
        return
    LOGGER.info("prediction_event type=%s payload=%s", event_type, json.dumps(payload, default=str))


async def log_request_response(request: Request, call_next):
    started_at = perf_counter()
    try:
        response = await call_next(request)
        LOGGER.info(
            "request path=%s method=%s status=%s duration_ms=%.2f",
            request.url.path,
            request.method,
            response.status_code,
            (perf_counter() - started_at) * 1000,
        )
        return response
    except Exception:
        LOGGER.exception("request_failed path=%s method=%s", request.url.path, request.method)
        raise
