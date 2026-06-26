import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DATABASE_URL: str = os.getenv("DATABASE_URL", "")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

logger = logging.getLogger(__name__)


def init_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment JSONB"
        ))
        conn.commit()
    logger.info("Database initialised")


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
