import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
from app.config import settings
from app.routers import auth, jam

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="JAM AI Analyzer API",
    description="Backend services for the Just A Minute Speech and Body Language Analyzer.",
    version="1.0.0"
)

# Configure CORS for Frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production to frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload dir exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Mount upload directory as static files to allow direct streaming/playback in UI
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Register Routers
app.include_router(auth.router, prefix="/api")
app.include_router(jam.router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "message": "Welcome to JAM AI Analyzer API!",
        "docs_url": "/docs",
        "status": "active"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
