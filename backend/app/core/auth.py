import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import execute_query

security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

def create_token(email: str, code: str) -> str:
    """Create a signed JWT token with 24h expiry."""
    payload = {
        "sub": email,
        "code": code,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> tuple[str, str]:
    """
    Verify JWT token. Returns (email, code).
    Falls back to legacy base64 format for backward compatibility.
    """
    # Try JWT first
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload["sub"], payload["code"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please log in again")
    except jwt.InvalidTokenError:
        pass

    raise HTTPException(status_code=401, detail="Invalid token — please log in again")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """Validate JWT token and return user context."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    email, code = verify_token(credentials.credentials)

    rows = execute_query("""
        SELECT u.email, ac.is_active, ac.max_scans, ac.scans_used,
               u.org_id, u.role, o.name as org_name, o.slug, o.plan
        FROM users u
        JOIN access_codes ac ON u.access_code = ac.code
        LEFT JOIN organisations o ON u.org_id = o.id
        WHERE u.email = %s AND u.access_code = %s
    """, (email, code.upper()))

    if not rows:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    email, is_active, max_scans, scans_used, org_id, role, org_name, slug, plan = rows[0]
    org_id   = str(org_id) if org_id   else "b0000000-0000-0000-0000-000000000001"
    org_name = org_name    if org_name else email
    slug     = slug        if slug     else "personal"
    plan     = plan        if plan     else "free"

    if not is_active:
        raise HTTPException(status_code=403, detail="Access revoked")

    return {
        "email": email,
        "org_id": str(org_id),
        "role": role,
        "org_name": org_name,
        "org_slug": slug,
        "plan": plan,
        "scans_remaining": max_scans - scans_used
    }
