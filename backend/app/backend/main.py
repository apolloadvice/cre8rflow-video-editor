from dotenv import load_dotenv
load_dotenv(override=True)
from pathlib import Path
import os

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

print("DEBUG OPENAI_API_KEY:", os.getenv("OPENAI_API_KEY"))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.backend.timeline_api import router as timeline_router
from app.backend.command_api import router as command_router
from app.backend.upload_api import router as upload_router
from app.backend.video_cutting_api import router as video_cutting_router

# Try to import GES API with error handling
try:
    from app.backend.ges_api import router as ges_router
    GES_ROUTER_AVAILABLE = True
    print("✅ GES router loaded successfully")
except Exception as e:
    GES_ROUTER_AVAILABLE = False
    print(f"⚠️ GES router disabled due to import error: {e}")

# Try to import Projects API with error handling
try:
    from app.backend.projects_api import router as projects_router
    PROJECTS_ROUTER_AVAILABLE = True
    print("✅ Projects router loaded successfully")
except Exception as e:
    PROJECTS_ROUTER_AVAILABLE = False
    print(f"⚠️ Projects router disabled due to import error: {e}")

# Try to import Effects API with error handling
try:
    from app.backend.effects_api import router as effects_router
    EFFECTS_ROUTER_AVAILABLE = True
    print("✅ Effects router loaded successfully")
except Exception as e:
    EFFECTS_ROUTER_AVAILABLE = False
    print(f"⚠️ Effects router disabled due to import error: {e}")

# Try to import Export API with error handling
try:
    from app.backend.export_api import router as export_router
    EXPORT_ROUTER_AVAILABLE = True
    print("✅ Export router loaded successfully")
except Exception as e:
    EXPORT_ROUTER_AVAILABLE = False
    print(f"⚠️ Export router disabled due to import error: {e}")

# Try to import Performance API with error handling
try:
    from app.backend.performance_api import router as performance_router
    PERFORMANCE_ROUTER_AVAILABLE = True
    print("✅ Performance router loaded successfully")
except Exception as e:
    PERFORMANCE_ROUTER_AVAILABLE = False
    print(f"⚠️ Performance router disabled due to import error: {e}")

app = FastAPI()

# Initialize GStreamer early in the main thread to avoid threading issues
if GES_ROUTER_AVAILABLE:
    try:
        from app.backend.ges_service import _initialize_ges
        print("🎬 Attempting early GStreamer initialization...")
        if _initialize_ges():
            print("✅ GStreamer initialized successfully at startup")
        else:
            print("⚠️ GStreamer initialization failed at startup")
    except Exception as e:
        print(f"❌ Failed to initialize GStreamer at startup: {e}")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
def read_root():
    return {"status": "ok"}

# Include the timeline API router
app.include_router(timeline_router, prefix="/api")

# Include the command API router
app.include_router(command_router, prefix="/api")

# Include the command API v2 router (with OTIO support)
try:
    from app.backend.command_api_v2 import router as command_v2_router
    app.include_router(command_v2_router, prefix="/api")
    print("✅ Command API v2 (OTIO support) loaded successfully")
except Exception as e:
    print(f"⚠️ Command API v2 disabled due to import error: {e}")

# Include the upload API router
app.include_router(upload_router, prefix="/api")

# Include the video cutting API router
app.include_router(video_cutting_router, prefix="/api")

# Include the GES API router if available
if GES_ROUTER_AVAILABLE:
    app.include_router(ges_router, prefix="/api")
    print("✅ GES endpoints registered")
else:
    print("⚠️ GES endpoints skipped") 

# Include the Projects API router if available
if PROJECTS_ROUTER_AVAILABLE:
    app.include_router(projects_router, prefix="/api")
    print("✅ Projects endpoints registered")
else:
    print("⚠️ Projects endpoints skipped") 

# Include the Effects API router if available
if EFFECTS_ROUTER_AVAILABLE:
    app.include_router(effects_router, prefix="/api")
    print("✅ Effects endpoints registered")
else:
    print("⚠️ Effects endpoints skipped") 

# Include the Export API router if available
if EXPORT_ROUTER_AVAILABLE:
    app.include_router(export_router, prefix="/api")
    print("✅ Export endpoints registered")
else:
    print("⚠️ Export endpoints skipped") 

# Include the Performance API router if available
if PERFORMANCE_ROUTER_AVAILABLE:
    app.include_router(performance_router, prefix="/api")
    print("✅ Performance endpoints registered")
else:
    print("⚠️ Performance endpoints skipped")

# Add startup and shutdown event handlers for GStreamer
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 FastAPI application starting up...")
    
@app.on_event("shutdown") 
async def shutdown_event():
    """Clean up services on shutdown"""
    print("🛑 FastAPI application shutting down...")
    
    # Clean up GStreamer resources if available
    if GES_ROUTER_AVAILABLE:
        try:
            from app.backend.ges_service import cleanup_ges_service
            print("🎬 Cleaning up GStreamer resources...")
            cleanup_ges_service()
            print("✅ GStreamer cleanup completed")
        except Exception as e:
            print(f"❌ Error during GStreamer cleanup: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 