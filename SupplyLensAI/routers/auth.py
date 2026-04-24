from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.auth_service import authenticate, get_user_by_token, list_demo_users, revoke_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    user_id: str
    password: str


def _token_from_header(authorization: Optional[str]) -> str:
    if not authorization:
        return ""

    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix):].strip()

    return authorization.strip()


@router.post("/login")
def login(payload: LoginRequest):
    auth = authenticate(payload.user_id, payload.password)
    if not auth:
        raise HTTPException(status_code=401, detail="Invalid user ID or password")

    return auth


@router.get("/me")
def me(authorization: Optional[str] = Header(default=None)):
    token = _token_from_header(authorization)
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return {"user": user}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    token = _token_from_header(authorization)
    if token:
        revoke_token(token)
    return {"status": "logged_out"}


@router.get("/demo-users")
def demo_users():
    return {"users": list_demo_users()}
