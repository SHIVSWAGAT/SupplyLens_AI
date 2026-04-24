from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from config import get_settings
from models.schemas import Alert, Shipment


class Base(DeclarativeBase):
    pass


class ShipmentRecord(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tracking_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    origin: Mapped[str] = mapped_column(String, index=True)
    destination: Mapped[str] = mapped_column(String, index=True)
    carrier: Mapped[str] = mapped_column(String, index=True)
    mode: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    risk_level: Mapped[str] = mapped_column(String)
    risk_score: Mapped[float] = mapped_column(Float)
    delay_minutes: Mapped[int] = mapped_column(Integer, default=0)
    predicted_eta: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    anomaly_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AlertRecord(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    shipment_id: Mapped[str] = mapped_column(String, index=True)
    tracking_number: Mapped[str] = mapped_column(String, index=True)
    severity: Mapped[str] = mapped_column(String)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class RouteRecord(Base):
    __tablename__ = "routes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    shipment_id: Mapped[str] = mapped_column(String, index=True)
    label: Mapped[str] = mapped_column(String)
    risk_score: Mapped[float] = mapped_column(Float)
    cost_usd: Mapped[float] = mapped_column(Float)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class UserRecord(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    role: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    carrier_scope: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ChatHistoryRecord(Base):
    __tablename__ = "chat_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    role: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(String)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


engine = create_engine(get_settings().database_url, future=True)
SessionLocal = sessionmaker(bind=engine, future=True, expire_on_commit=False)


def init_database() -> None:
    Base.metadata.create_all(engine)


def seed_users(users: Iterable[dict]) -> None:
    with SessionLocal() as session:
        for user in users:
            session.merge(
                UserRecord(
                    user_id=user["user_id"],
                    role=user["role"],
                    name=user["name"],
                    carrier_scope=user.get("carrier_scope"),
                    payload=user,
                )
            )
        session.commit()


def _persist_routes(session: Session, shipments: Iterable[Shipment]) -> None:
    shipment_ids = [shipment.id for shipment in shipments]
    if shipment_ids:
        existing = session.scalars(select(RouteRecord).where(RouteRecord.shipment_id.in_(shipment_ids))).all()
        for item in existing:
            session.delete(item)

    for shipment in shipments:
        for route in shipment.route_options:
            session.add(
                RouteRecord(
                    id=route.id,
                    shipment_id=shipment.id,
                    label=route.label,
                    risk_score=route.risk_score,
                    cost_usd=route.cost_usd,
                    payload=route.model_dump(mode="json"),
                )
            )


def persist_shipments(shipments: List[Shipment]) -> None:
    with SessionLocal() as session:
        for record in session.scalars(select(RouteRecord)).all():
            session.delete(record)
        for record in session.scalars(select(ShipmentRecord)).all():
            session.delete(record)
        session.flush()
        for shipment in shipments:
            payload = shipment.model_dump(mode="json")
            session.add(
                ShipmentRecord(
                    id=shipment.id,
                    tracking_number=shipment.tracking_number,
                    origin=shipment.origin,
                    destination=shipment.destination,
                    carrier=shipment.carrier,
                    mode=shipment.mode.value if hasattr(shipment.mode, "value") else str(shipment.mode),
                    status=shipment.status.value if hasattr(shipment.status, "value") else str(shipment.status),
                    risk_level=shipment.risk_level.value if hasattr(shipment.risk_level, "value") else str(shipment.risk_level),
                    risk_score=shipment.risk_score,
                    delay_minutes=shipment.delay_minutes,
                    predicted_eta=(shipment.ml_prediction.predicted_eta if shipment.ml_prediction else None),
                    anomaly_detected=bool(shipment.ml_prediction.anomaly_detected) if shipment.ml_prediction else False,
                    payload=payload,
                )
            )
        _persist_routes(session, shipments)
        session.commit()


def persist_alerts(alerts: List[Alert]) -> None:
    with SessionLocal() as session:
        for alert in alerts:
            payload = alert.model_dump(mode="json")
            session.merge(
                AlertRecord(
                    id=alert.id,
                    shipment_id=alert.shipment_id,
                    tracking_number=alert.tracking_number,
                    severity=alert.severity.value if hasattr(alert.severity, "value") else str(alert.severity),
                    acknowledged=alert.acknowledged,
                    title=alert.title,
                    message=alert.message,
                    payload=payload,
                )
            )
        session.commit()


def load_shipments() -> List[Shipment]:
    with SessionLocal() as session:
        records = session.scalars(select(ShipmentRecord)).all()
        return [Shipment.model_validate(record.payload) for record in records]


def load_alerts() -> List[Alert]:
    with SessionLocal() as session:
        records = session.scalars(select(AlertRecord)).all()
        return [Alert.model_validate(record.payload) for record in records]


def append_chat_history(user_id: str, role: str, content: str, metadata: Optional[dict] = None) -> None:
    with SessionLocal() as session:
        session.add(
            ChatHistoryRecord(
                user_id=user_id,
                role=role,
                content=content,
                metadata_json=metadata or {},
            )
        )
        session.commit()


def get_recent_chat_history(user_id: str, limit: int = 12) -> list[dict]:
    with SessionLocal() as session:
        rows = session.scalars(
            select(ChatHistoryRecord)
            .where(ChatHistoryRecord.user_id == user_id)
            .order_by(ChatHistoryRecord.created_at.desc())
            .limit(limit)
        ).all()
        return [
            {
                "role": row.role,
                "content": row.content,
                "created_at": row.created_at.isoformat(),
                "metadata": row.metadata_json,
            }
            for row in reversed(rows)
        ]
