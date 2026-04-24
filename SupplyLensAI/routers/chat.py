import datetime
import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from routers.alerts import get_current_alerts
from routers.analytics import get_current_kpis_data
from routers.routes import optimize as optimize_route_handler
from routers.shipments import get_current_shipments
from routers.weather import get_current_weather_snapshot
from services.llm_agent import LLMAgent
from services.platform_store import append_chat_history
from services.reliability import PromptInjectionError

router = APIRouter(prefix="/api/chat", tags=["chat"])

_shipments = []
_agent: Optional[LLMAgent] = None


def set_data(shipments):
    global _shipments
    _shipments = shipments


def _get_agent() -> LLMAgent:
    global _agent
    if _agent is None:
        _agent = LLMAgent(
            get_shipments=get_current_shipments,
            get_alerts=get_current_alerts,
            get_weather=get_current_weather_snapshot,
            get_kpis=get_current_kpis_data,
            optimize_route=lambda payload: optimize_route_handler(payload),
        )
    return _agent


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = Field(default_factory=list)


@router.post("")
async def chat(req: ChatRequest, request: Request):
    try:
        response = await _get_agent().respond(
            req.message,
            history=[item.model_dump() for item in req.history or []],
        )
    except PromptInjectionError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        # Return a JSON-serializable error response instead of letting it become an HTML error page
        return {
            "reply": f"I'm sorry, but I encountered an error processing your request. Please try again in a moment.",
            "tool_trace": [],
            "sources": [],
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "error": str(error),
        }

    user_id = getattr(request.state, "user", {}).get("user_id", "anonymous")
    append_chat_history(user_id, "user", req.message, {"channel": "api"})
    append_chat_history(user_id, "assistant", response["reply"], {"tool_trace": response.get("tool_trace", [])})

    return {
        "reply": response["reply"],
        "tool_trace": response.get("tool_trace", []),
        "sources": response.get("sources", []),
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
    }


@router.post("/stream")
async def chat_stream(req: ChatRequest, request: Request):
    async def event_stream():
        collected = []
        try:
            async for chunk in _get_agent().stream_response(
                req.message,
                history=[item.model_dump() for item in req.history or []],
            ):
                collected.append(chunk)
                yield f"data: {json.dumps({'type': 'delta', 'delta': chunk})}\n\n"
        except PromptInjectionError as error:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(error)})}\n\n"
            return
        except Exception as error:
            # Return a proper JSON error event instead of crashing the stream
            error_msg = f"I'm sorry, but I encountered an error processing your request."
            yield f"data: {json.dumps({'type': 'error', 'detail': error_msg, 'error': str(error)})}\n\n"
            return

        reply = "".join(collected).strip()
        user_id = getattr(request.state, "user", {}).get("user_id", "anonymous")
        append_chat_history(user_id, "user", req.message, {"channel": "stream"})
        append_chat_history(user_id, "assistant", reply, {"channel": "stream"})
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
