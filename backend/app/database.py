import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger("jam_analyzer")

connect_args = {}
db_url = settings.DATABASE_URL

if db_url and db_url.startswith("sqlite"):
    logger.info(f"Connecting to local SQLite database: {db_url}")
    connect_args = {"check_same_thread": False}
    engine = create_engine(db_url, connect_args=connect_args)
else:
    try:
        logger.info(f"Attempting connection to primary PostgreSQL database...")
        engine = create_engine(db_url)
        # Verify connection immediately to trigger fallback if port is closed
        with engine.connect() as conn:
            pass
        logger.info("Successfully connected to PostgreSQL database.")
    except Exception as e:
        logger.warning(f"Database connection to '{db_url}' failed: {e}")
        logger.warning("Falling back to local SQLite database: 'sqlite:///./jam_analyzer.db'")
        db_url = "sqlite:///./jam_analyzer.db"
        connect_args = {"check_same_thread": False}
        engine = create_engine(db_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
