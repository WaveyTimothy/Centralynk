import psycopg2
import psycopg2.pool
import os
from contextlib import contextmanager

# Connection pool - enterprise grade
pool = psycopg2.pool.ThreadedConnectionPool(
    minconn=2,
    maxconn=10,
    dsn=os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")
)

@contextmanager
def get_db():
    """Raw psycopg2 connection from pool"""
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)

def execute_query(query: str, params: tuple = None) -> list:
    """Execute a SELECT query and return results"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

def execute_write(query: str, params: tuple = None) -> None:
    """Execute INSERT/UPDATE/DELETE"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)

def init_schema():
    """Initialize database schema"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE EXTENSION IF NOT EXISTS vector;
                CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
                
                CREATE TABLE IF NOT EXISTS brands (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    domain VARCHAR(255) UNIQUE NOT NULL,
                    description TEXT,
                    keywords TEXT[],
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS engine_scans (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
                    engine_name VARCHAR(100) NOT NULL,
                    query TEXT NOT NULL,
                    response TEXT,
                    brand_mentioned BOOLEAN DEFAULT FALSE,
                    sentiment VARCHAR(50),
                    position INTEGER DEFAULT 0,
                    embedding vector(768),
                    scanned_at TIMESTAMPTZ DEFAULT NOW(),
                    lessons_learned JSONB DEFAULT '{}'::jsonb
                );

                CREATE TABLE IF NOT EXISTS recommendations (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
                    recommendation TEXT NOT NULL,
                    priority VARCHAR(50) DEFAULT 'medium',
                    status VARCHAR(50) DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_scans_brand ON engine_scans(brand_id);
                CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);
            """)
        conn.commit()
