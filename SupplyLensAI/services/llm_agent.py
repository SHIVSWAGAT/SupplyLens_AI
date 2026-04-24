from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import AsyncGenerator, Callable

import httpx

from config import BASE_DIR, get_settings
from models.schemas import RouteOptimizeRequest
from services.reliability import CircuitBreaker, PromptGuard, with_retry
from services.retrieval_service import get_retrieval_service
from services.telemetry import LOGGER
from services.weather_service import get_weather_summary_for_llm


class BaseProvider:
    async def complete(self, messages: list[dict]) -> str:
        raise NotImplementedError

    async def stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        text = await self.complete(messages)
        for chunk in text.split():
            yield f"{chunk} "
            await asyncio.sleep(0)


class UnavailableProvider(BaseProvider):
    def __init__(self, reason: str):
        self.reason = reason

    async def complete(self, messages: list[dict]) -> str:
        raise RuntimeError(self.reason)

    async def stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        raise RuntimeError(self.reason)


class OllamaProvider(BaseProvider):
    def __init__(self, base_url: str, model: str, timeout_seconds: float):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.breaker = CircuitBreaker()

    async def complete(self, messages: list[dict]) -> str:
        async def operation():
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {"temperature": 0.2, "num_predict": 500},
                    },
                )
                response.raise_for_status()
                payload = response.json()
                return payload["message"]["content"]

        return await with_retry(operation, retries=2, timeout_seconds=self.timeout_seconds, breaker=self.breaker)

    async def stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        async def operation():
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "options": {"temperature": 0.2, "num_predict": 500},
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        if data.get("done"):
                            break
                        delta = data.get("message", {}).get("content", "")
                        if delta:
                            yield delta

        self.breaker.allow()
        try:
            async for chunk in operation():
                yield chunk
            self.breaker.record_success()
        except Exception:
            self.breaker.record_failure()
            raise


class OpenAIProvider(BaseProvider):
    def __init__(self, api_key: str, model: str, timeout_seconds: float):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.breaker = CircuitBreaker()

    async def complete(self, messages: list[dict]) -> str:
        system = "\n".join(message["content"] for message in messages if message["role"] == "system")
        conversation = [message for message in messages if message["role"] != "system"]

        async def operation():
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "instructions": system,
                        "input": conversation,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                return payload.get("output_text", "").strip()

        return await with_retry(operation, retries=2, timeout_seconds=self.timeout_seconds, breaker=self.breaker)


class GeminiProvider(BaseProvider):
    MAX_RETRIES_429 = 3

    def __init__(self, api_key: str, model: str, timeout_seconds: float):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.breaker = CircuitBreaker()

    def _build_gemini_payload(self, messages: list[dict]) -> dict:
        """Convert chat messages into Gemini API format with systemInstruction."""
        system_parts = []
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("content", "")
            if role == "system":
                system_parts.append({"text": text})
            else:
                gemini_role = "model" if role == "assistant" else "user"
                contents.append({"role": gemini_role, "parts": [{"text": text}]})

        # Gemini requires alternating user/model turns; merge consecutive same-role entries.
        merged: list[dict] = []
        for entry in contents:
            if merged and merged[-1]["role"] == entry["role"]:
                merged[-1]["parts"].extend(entry["parts"])
            else:
                merged.append(entry)

        # Ensure conversation starts with a user turn (Gemini requirement).
        if merged and merged[0]["role"] == "model":
            merged.insert(0, {"role": "user", "parts": [{"text": "(context)"}]})

        payload: dict = {"contents": merged or [{"role": "user", "parts": [{"text": "(no context)"}]}]}
        if system_parts:
            payload["systemInstruction"] = {"parts": system_parts}
        payload["generationConfig"] = {"temperature": 0.3, "maxOutputTokens": 800}
        return payload

    async def _post_with_retry(self, url: str, payload: dict, client: httpx.AsyncClient) -> httpx.Response:
        """POST with automatic retry on 429 rate-limit responses."""
        last_error = None
        for attempt in range(self.MAX_RETRIES_429):
            response = await client.post(url, json=payload)
            if response.status_code != 429:
                return response
            # Parse retry delay from error body, default to exponential backoff.
            try:
                err = response.json()
                details = err.get("error", {}).get("details", [])
                retry_info = next((d for d in details if "retryDelay" in d), None)
                wait_str = retry_info["retryDelay"] if retry_info else f"{2 ** attempt * 5}s"
                wait_secs = float(wait_str.rstrip("s"))
            except Exception:
                wait_secs = 2 ** attempt * 5
            LOGGER.warning("gemini_429 attempt=%d wait=%.1fs", attempt + 1, wait_secs)
            last_error = response
            await asyncio.sleep(min(wait_secs, 60))
        # All retries exhausted
        return last_error  # type: ignore[return-value]

    async def complete(self, messages: list[dict]) -> str:
        payload = self._build_gemini_payload(messages)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

        async def operation():
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await self._post_with_retry(url, payload, client)
                if response.status_code == 429:
                    raise RuntimeError(
                        "Gemini API rate limit exceeded. Your free-tier quota may be exhausted — "
                        "please check billing at https://ai.google.dev or wait a few minutes and retry."
                    )
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]

        return await with_retry(operation, retries=2, timeout_seconds=self.timeout_seconds + 70, breaker=self.breaker)

    async def stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        payload = self._build_gemini_payload(messages)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}"
            f":streamGenerateContent?alt=sse&key={self.api_key}"
        )
        self.breaker.allow()
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                response = await self._post_with_retry(url, payload, client)
                if response.status_code == 429:
                    yield "⚠️ Gemini rate limit hit. Please wait a minute and try again."
                    return
                response.raise_for_status()
                # For streaming, we need to re-request with stream
                async with client.stream("POST", url, json=payload) as stream_resp:
                    stream_resp.raise_for_status()
                    async for line in stream_resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[len("data: "):]
                        if raw.strip() == "[DONE]":
                            break
                        try:
                            chunk_data = json.loads(raw)
                            parts = chunk_data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                            for part in parts:
                                text = part.get("text", "")
                                if text:
                                    yield text
                        except (json.JSONDecodeError, IndexError, KeyError):
                            continue
            self.breaker.record_success()
        except Exception:
            self.breaker.record_failure()
            raise


def build_provider() -> BaseProvider:
    settings = get_settings()
    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            return UnavailableProvider("LLM_PROVIDER=openai requires OPENAI_API_KEY")
        return OpenAIProvider(settings.openai_api_key, settings.openai_model, settings.llm_timeout_seconds)
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            return UnavailableProvider("LLM_PROVIDER=gemini requires GEMINI_API_KEY")
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model, settings.llm_timeout_seconds)
    if settings.llm_provider == "ollama":
        return OllamaProvider(settings.ollama_base_url, settings.ollama_model, settings.llm_timeout_seconds)
    return UnavailableProvider(
        f"Unsupported LLM_PROVIDER '{settings.llm_provider}'. "
        "Use one of: openai, gemini, ollama."
    )


class LLMAgent:
    def __init__(
        self,
        *,
        get_shipments: Callable[[], list],
        get_alerts: Callable[[], list],
        get_weather: Callable[[], dict],
        get_kpis: Callable[[], dict | None],
        optimize_route: Callable[[RouteOptimizeRequest], list],
    ):
        self.provider = build_provider()
        self.get_shipments = get_shipments
        self.get_alerts = get_alerts
        self.get_weather = get_weather
        self.get_kpis = get_kpis
        self.optimize_route = optimize_route
        self.knowledge_base_path = BASE_DIR / "knowledge_base.txt"

    def _load_knowledge_base(self) -> str:
        if not self.knowledge_base_path.exists():
            return ""
        return self.knowledge_base_path.read_text(encoding="utf-8").strip()

    def _select_tools(self, query: str) -> list[str]:
        lowered = query.lower()
        tools: list[str] = []
        if any(token in lowered for token in ["shipment", "shipments", "show shipments", "high risk", "delayed"]):
            tools.append("get_shipments")
        if any(token in lowered for token in ["alert", "alerts", "disruption", "incident"]):
            tools.append("get_alerts")
        if any(token in lowered for token in ["route", "reroute", "optimize", "fastest", "cheapest", "safest"]):
            tools.append("optimize_route")
        if not tools:
            tools.append("get_shipments")
        return tools

    def _run_tools(self, query: str) -> tuple[list[dict], list[dict]]:
        tool_trace = []
        context_blocks = []
        tools = self._select_tools(query)

        shipments = self.get_shipments()
        alerts = self.get_alerts()
        kpis = self.get_kpis() or {}

        if "get_shipments" in tools:
            risky = sorted(shipments, key=lambda item: item.risk_score, reverse=True)[:8]
            data = [
                {
                    "shipment_id": shipment.id,
                    "tracking_number": shipment.tracking_number,
                    "route": f"{shipment.origin} -> {shipment.destination}",
                    "status": shipment.status.value if hasattr(shipment.status, "value") else str(shipment.status),
                    "risk_score": round(float(shipment.risk_score), 4),
                    "delay_minutes": shipment.delay_minutes,
                    "predicted_eta": shipment.ml_prediction.predicted_eta if shipment.ml_prediction else None,
                    "top_factors": shipment.ml_prediction.top_factors if shipment.ml_prediction else [],
                }
                for shipment in risky
            ]
            context_blocks.append({"tool": "get_shipments", "data": data})
            tool_trace.append(
                {
                    "tool": "get_shipments",
                    "count": len(data),
                    "summary": "Fetched live shipment risk data.",
                }
            )

        if "get_alerts" in tools:
            open_alerts = [
                {
                    "title": alert.title,
                    "severity": alert.severity.value if hasattr(alert.severity, "value") else str(alert.severity),
                    "tracking_number": alert.tracking_number,
                    "message": alert.message,
                }
                for alert in alerts[:8]
            ]
            context_blocks.append({"tool": "get_alerts", "data": open_alerts})
            tool_trace.append(
                {
                    "tool": "get_alerts",
                    "count": len(open_alerts),
                    "summary": "Fetched active platform alerts.",
                }
            )

        if "optimize_route" in tools and shipments:
            shipment = sorted(shipments, key=lambda item: item.risk_score, reverse=True)[0]
            optimized = self.optimize_route(
                RouteOptimizeRequest(
                    origin=shipment.origin,
                    destination=shipment.destination,
                    cargo_type=shipment.cargo_type,
                    weight_kg=shipment.weight_kg,
                    priority="safest",
                )
            )
            context_blocks.append(
                {
                    "tool": "optimize_route",
                    "data": [
                        {
                            "label": route.label,
                            "risk_score": route.risk_score,
                            "cost_usd": route.cost_usd,
                            "estimated_hours": route.estimated_hours,
                        }
                        for route in optimized
                    ],
                }
            )
            tool_trace.append(
                {
                    "tool": "optimize_route",
                    "count": len(optimized),
                    "summary": f"Optimized alternates for {shipment.tracking_number}.",
                }
            )

        context_blocks.append({"tool": "kpis", "data": kpis})
        return context_blocks, tool_trace

    def _build_messages(self, query: str, history: list[dict] | None, tool_context: list[dict], retrieved: list[dict]) -> list[dict]:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are Nexus, a supply-chain AI assistant. Answer using only the provided platform context, "
                    "tool outputs, and logistics notes. Be concise, practical, and explicit when the answer is based "
                    "on shipment data, alert data, or route optimization results."
                ),
            },
            {
                "role": "system",
                "content": f"LIVE WEATHER SUMMARY:\n{get_weather_summary_for_llm()}",
            },
            {
                "role": "system",
                "content": f"PLATFORM TOOL OUTPUTS:\n{json.dumps(tool_context, default=str)}",
            },
            {
                "role": "system",
                "content": f"KNOWLEDGE BASE:\n{self._load_knowledge_base() or 'No extra knowledge base loaded.'}",
            },
            {
                "role": "system",
                "content": f"RETRIEVED SNIPPETS:\n{json.dumps(retrieved, default=str)}",
            },
        ]

        for item in (history or [])[-8:]:
            messages.append({"role": item["role"], "content": item["content"]})

        messages.append({"role": "user", "content": query})
        return messages

    async def respond(self, query: str, history: list[dict] | None = None) -> dict:
        PromptGuard.validate(query)
        retrieved = get_retrieval_service().search(query, top_k=3)
        tool_context, tool_trace = self._run_tools(query)
        messages = self._build_messages(query, history, tool_context, retrieved)

        try:
            reply = await self.provider.complete(messages)
        except Exception as error:
            LOGGER.warning("llm_fallback error=%s", error)
            reply = self._fallback_reply(query, tool_context, retrieved)

        return {"reply": reply.strip(), "tool_trace": tool_trace, "sources": retrieved}

    async def stream_response(self, query: str, history: list[dict] | None = None) -> AsyncGenerator[str, None]:
        PromptGuard.validate(query)
        retrieved = get_retrieval_service().search(query, top_k=3)
        tool_context, _ = self._run_tools(query)
        messages = self._build_messages(query, history, tool_context, retrieved)

        try:
            async for chunk in self.provider.stream(messages):
                yield chunk
        except Exception:
            fallback = self._fallback_reply(query, tool_context, retrieved)
            for token in fallback.split():
                yield f"{token} "
                await asyncio.sleep(0)

    def _fallback_reply(self, query: str, tool_context: list[dict], retrieved: list[dict]) -> str:
        shipments_block = next((item for item in tool_context if item["tool"] == "get_shipments"), {"data": []})
        alerts_block = next((item for item in tool_context if item["tool"] == "get_alerts"), {"data": []})
        routes_block = next((item for item in tool_context if item["tool"] == "optimize_route"), {"data": []})
        lines = [
            "The configured LLM provider is unavailable, so here is a grounded summary from live platform data.",
            f"High-risk shipments reviewed: {len(shipments_block['data'])}.",
            f"Open alerts reviewed: {len(alerts_block['data'])}.",
        ]
        if shipments_block["data"]:
            top = shipments_block["data"][0]
            lines.append(
                f"Highest-risk shipment is {top['tracking_number']} on {top['route']} with ML risk {round(top['risk_score'] * 100)}% and ETA {top.get('predicted_eta') or 'not available'}."
            )
        if routes_block["data"]:
            safest = min(routes_block["data"], key=lambda route: route["risk_score"])
            lines.append(
                f"Safest alternate route is {safest['label']} with risk {round(float(safest['risk_score']) * 100)}% and ETA {safest['estimated_hours']} hours."
            )
        if retrieved:
            lines.append(f"Relevant playbook source: {retrieved[0]['source']}.")
        lines.append(f"Question handled: {query}")
        return " ".join(lines)
