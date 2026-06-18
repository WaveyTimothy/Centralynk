import psycopg2
import hashlib
import secrets
import json
from datetime import datetime
from app.core.database import execute_query, execute_write

def init_access_tables():
    """Create access code tables"""
    from app.core.database import get_db
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS access_codes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    code VARCHAR(20) UNIQUE NOT NULL,
                    email VARCHAR(255),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    used_at TIMESTAMPTZ,
                    is_active BOOLEAN DEFAULT TRUE,
                    max_scans INTEGER DEFAULT 10,
                    scans_used INTEGER DEFAULT 0,
                    notes TEXT
                );

                CREATE TABLE IF NOT EXISTS users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    access_code VARCHAR(20) REFERENCES access_codes(code),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    last_seen TIMESTAMPTZ DEFAULT NOW(),
                    scans_today INTEGER DEFAULT 0,
                    total_scans INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS waitlist (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255),
                    company VARCHAR(255),
                    reason TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    invited BOOLEAN DEFAULT FALSE
                );

                CREATE INDEX IF NOT EXISTS idx_access_codes_code 
                    ON access_codes(code);
                CREATE INDEX IF NOT EXISTS idx_users_email 
                    ON users(email);
            """)
        conn.commit()

def generate_access_code(
    email: str = None,
    max_scans: int = 10,
    notes: str = ""
) -> str:
    """Generate a new access code — call this to invite someone"""
    code = secrets.token_urlsafe(8).upper()[:12]
    execute_write("""
        INSERT INTO access_codes (code, email, max_scans, notes)
        VALUES (%s, %s, %s, %s)
    """, (code, email, max_scans, notes))
    return code

def validate_access_code(code: str, email: str) -> dict:
    """Validate access code and register user"""
    rows = execute_query("""
        SELECT code, is_active, max_scans, scans_used, email
        FROM access_codes 
        WHERE code = %s
    """, (code.upper(),))
    
    if not rows:
        return {"valid": False, "reason": "Invalid access code"}
    
    _, is_active, max_scans, scans_used, assigned_email = rows[0]
    
    if not is_active:
        return {"valid": False, "reason": "Access code is no longer active"}
    
    if scans_used >= max_scans:
        return {"valid": False, "reason": "Scan limit reached for this code"}
    
    # Register or update user
    execute_write("""
        INSERT INTO users (email, access_code)
        VALUES (%s, %s)
        ON CONFLICT (email) DO UPDATE SET last_seen = NOW()
    """, (email, code.upper()))
    
    # Mark code as used
    execute_write("""
        UPDATE access_codes 
        SET used_at = NOW()
        WHERE code = %s AND used_at IS NULL
    """, (code.upper(),))
    
    return {
        "valid": True,
        "email": email,
        "scans_remaining": max_scans - scans_used
    }

def check_scan_limit(email: str) -> dict:
    """Check if user can run more scans"""
    rows = execute_query("""
        SELECT u.scans_today, u.total_scans, ac.max_scans, ac.scans_used
        FROM users u
        JOIN access_codes ac ON u.access_code = ac.code
        WHERE u.email = %s
    """, (email,))
    
    if not rows:
        return {"allowed": False, "reason": "User not found"}
    
    scans_today, total_scans, max_scans, scans_used = rows[0]
    
    if scans_used >= max_scans:
        return {"allowed": False, "reason": "Scan limit reached"}
    
    if scans_today >= 3:
        return {"allowed": False, "reason": "Daily limit of 3 scans reached"}
    
    return {"allowed": True, "scans_remaining": max_scans - scans_used}

def increment_scan_count(email: str):
    """Increment scan counters after successful scan"""
    execute_write("""
        UPDATE users 
        SET scans_today = scans_today + 1,
            total_scans = total_scans + 1
        WHERE email = %s
    """, (email,))
    
    execute_write("""
        UPDATE access_codes ac
        SET scans_used = scans_used + 1
        FROM users u
        WHERE u.access_code = ac.code AND u.email = %s
    """, (email,))

def add_to_waitlist(email: str, name: str = "", company: str = "", reason: str = "") -> dict:
    """Add someone to waitlist"""
    try:
        execute_write("""
            INSERT INTO waitlist (email, name, company, reason)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
        """, (email, name, company, reason))
        return {"success": True, "message": "Added to waitlist!"}
    except Exception as e:
        return {"success": False, "message": str(e)}
