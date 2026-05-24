import logging
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

import os

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./voyager.db")

# check_same_thread=False is required for SQLite when FastAPI shares one
# connection across threads (each request runs in its own thread).
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

logger = logging.getLogger(__name__)


def init_db() -> None:
    """Create all tables if they don't already exist."""
    Base.metadata.create_all(bind=engine)
    # Add emoji column to existing databases that predate this field
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            from sqlalchemy import text
            for sql in [
                "ALTER TABLE workspaces ADD COLUMN emoji VARCHAR(10) NOT NULL DEFAULT '📁'",
                "ALTER TABLE documents ADD COLUMN progress INTEGER NOT NULL DEFAULT 0",
            ]:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception:
                    pass  # Column already exists
    logger.info("Database initialised at %s", DATABASE_URL)


def get_db():
    """FastAPI dependency — yields a SQLAlchemy session and closes it on exit."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
