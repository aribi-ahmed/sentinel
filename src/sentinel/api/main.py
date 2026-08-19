# src/sentinel/api/main.py
import uuid
import os
from pathlib import Path
from typing import List, Optional, Any, Dict
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from sentinel.database.db import get_db, init_db
from sentinel.database.crud import (
    create_investigation,
    finalize_investigation,
    fetch_all_investigations,
    fetch_investigation
)
from sentinel.graph.workflow import app as graph_app

app = FastAPI(
    title="SENTINEL AI Gateway API",
    description="Enterprise Multi-Agent Compliance & Intelligence API Gateway",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], # Add your exact React frontend URL(s) here
    allow_credentials=True,
    allow_methods=["*"], # This specifically allows the OPTIONS method
    allow_headers=["*"],
)

# Initialize Database tables on application startup
@app.on_event("startup")
def on_startup():
    init_db()


# --- Pydantic Data Models ---
class StartInvestigationRequest(BaseModel):
    subject_name: str
    ticker: Optional[str] = ""

class ApprovalRequest(BaseModel):
    approved: bool

class FileMetadata(BaseModel):
    name: str
    type: str  # 'dataset' or 'doc'
    size: int  # in bytes
    ext: str
    path: str

class InvestigationResponse(BaseModel):
    id: str
    subject_name: str
    ticker: Optional[str] = ""
    status: str
    risk_level: Optional[str] = "UNKNOWN"
    confidence: Optional[float] = None  # Confidence score 0-1 (certainty of risk assessment)
    human_approved: Optional[bool] = None
    supervisor_reasoning: Optional[str] = ""
    final_report: Optional[str] = ""
    research_data: Optional[List[Dict[str, Any]]] = []
    financial_data: Optional[Dict[str, Any]] = {}
    news_data: Optional[List[Dict[str, Any]]] = []
    compliance_data: Optional[List[str]] = []
    logs: Optional[List[str]] = []
    created_at: Optional[str] = ""


# --- API Endpoints ---

@app.post("/investigations", response_model=InvestigationResponse, status_code=status.HTTP_201_CREATED)
def start_investigation_endpoint(req: StartInvestigationRequest, db: Session = Depends(get_db)):
    """Triggers multi-agent analysis graph and saves initial record in SQL DB."""
    # 1. Save entry to SQL DB
    db_record = create_investigation(
        subject_name=req.subject_name,
        ticker=req.ticker,
        db=db
    )
    record_id = str(db_record.id)
    config = {"configurable": {"thread_id": record_id}}

    initial_input = {
        "investigation_id": record_id,
        "ticker": req.ticker,
        "subject_name": req.subject_name,
    }

    # 2. Run graph until human approval interrupt checkpoint
    try:
        graph_app.invoke(initial_input, config)
    except Exception:
        pass  # Expected pause at human checkpoint

    state = graph_app.get_state(config)
    values = state.values if state else {}

    return InvestigationResponse(
        id=record_id,
        subject_name=req.subject_name,
        ticker=req.ticker,
        status=db_record.status.value if hasattr(db_record.status, "value") else str(db_record.status),
        risk_level=values.get("risk_level", "UNKNOWN"),
        confidence=values.get("confidence"),
        human_approved=values.get("human_approved"),
        supervisor_reasoning=values.get("supervisor_reasoning", ""),
        final_report=values.get("final_report", ""),
        research_data=values.get("research_data", []),
        financial_data=values.get("financial_data", {}),
        news_data=values.get("news_data", []),
        compliance_data=values.get("compliance_data", []),
        logs=values.get("logs", []),
        created_at=db_record.created_at.isoformat() if db_record.created_at else ""
    )


@app.get("/investigations", response_model=List[Dict[str, Any]])
def list_investigations_endpoint(db: Session = Depends(get_db)):
    """Fetches full SQL audit trail history."""
    records = fetch_all_investigations(db=db)
    result = []
    for r in records:
        result.append({
            "Database ID": str(r.id),
            "Created At": r.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if r.created_at else "",
            "Company": r.subject_name,
            "Ticker": r.ticker or "N/A",
            "Status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "Risk Level": r.risk_level or "N/A",
            "Approved": "✅ Yes" if r.human_approved else ("❌ No" if r.human_approved is False else "Pending"),
        })
    return result


@app.get("/investigations/{investigation_id}", response_model=InvestigationResponse)
def get_investigation_endpoint(investigation_id: str, db: Session = Depends(get_db)):
    """Retrieves specific investigation snapshot from state and database."""
    config = {"configurable": {"thread_id": investigation_id}}
    state = graph_app.get_state(config)
    values = state.values if state else {}

    record = fetch_investigation(uuid.UUID(investigation_id), db=db)
    if not record:
        raise HTTPException(status_code=404, detail="Investigation record not found")

    return InvestigationResponse(
        id=investigation_id,
        subject_name=record.subject_name,
        ticker=record.ticker,
        status=record.status.value if hasattr(record.status, "value") else str(record.status),
        risk_level=values.get("risk_level") or record.risk_level or "UNKNOWN",
        confidence=values.get("confidence"),
        human_approved=values.get("human_approved") if values.get("human_approved") is not None else record.human_approved,
        supervisor_reasoning=values.get("supervisor_reasoning") or record.supervisor_reasoning or "",
        final_report=values.get("final_report") or record.final_report or "",
        research_data=values.get("research_data", []),
        financial_data=values.get("financial_data", {}),
        news_data=values.get("news_data", []),
        compliance_data=values.get("compliance_data", []),
        logs=values.get("logs", []),
        created_at=record.created_at.isoformat() if record.created_at else ""
    )


@app.post("/investigations/{investigation_id}/approve", response_model=InvestigationResponse)
def approve_investigation_endpoint(investigation_id: str, req: ApprovalRequest, db: Session = Depends(get_db)):
    """Submits human decision, resumes workflow to completion, and persists final report."""
    config = {"configurable": {"thread_id": investigation_id}}
    
    # 1. Inject human verdict into graph
    graph_app.update_state(config, {"human_approved": req.approved})

    # 2. Resume graph to final node
    for event in graph_app.stream(None, config):
        pass

    final_state = graph_app.get_state(config)
    final_values = final_state.values if final_state else {}

    risk_lvl = final_values.get("risk_level", "UNKNOWN")

    # 3. Finalize in SQL Database
    record = finalize_investigation(
        record_id=uuid.UUID(investigation_id),
        risk_level=risk_lvl,
        human_approved=req.approved,
        supervisor_reasoning=final_values.get("supervisor_reasoning", ""),
        final_report=final_values.get("final_report", ""),
        db=db
    )

    return InvestigationResponse(
        id=investigation_id,
        subject_name=record.subject_name if record else "",
        ticker=record.ticker if record else "",
        status=record.status.value if hasattr(record.status, "value") else "completed",
        risk_level=risk_lvl,
        confidence=final_values.get("confidence"),
        human_approved=req.approved,
        supervisor_reasoning=final_values.get("supervisor_reasoning", ""),
        final_report=final_values.get("final_report", ""),
        research_data=final_values.get("research_data", []),
        financial_data=final_values.get("financial_data", {}),
        news_data=final_values.get("news_data", []),
        compliance_data=final_values.get("compliance_data", []),
        logs=final_values.get("logs", []),
        created_at=record.created_at.isoformat() if record and record.created_at else ""
    )


@app.get("/assets/files", response_model=List[FileMetadata])
def get_assets_endpoint():
    """Fetches metadata for all datasets and documentation files."""
    files = []
    base_path = Path(__file__).parent.parent.parent.parent  # Get to project root
    
    # Scan datasets folder
    datasets_path = base_path / "datasets"
    if datasets_path.exists():
        for file in datasets_path.iterdir():
            if file.is_file():
                files.append(FileMetadata(
                    name=file.stem,
                    type="dataset",
                    size=file.stat().st_size,
                    ext=file.suffix.lstrip('.'),
                    path=f"/download/datasets/{file.name}"
                ))
    
    # Scan docs folder
    docs_path = base_path / "docs"
    if docs_path.exists():
        for file in docs_path.iterdir():
            if file.is_file():
                files.append(FileMetadata(
                    name=file.stem,
                    type="doc",
                    size=file.stat().st_size,
                    ext=file.suffix.lstrip('.'),
                    path=f"/download/docs/{file.name}"
                ))
    
    return files


@app.get("/download/{file_type}/{filename}")
def download_file_endpoint(file_type: str, filename: str):
    """Downloads a dataset or documentation file."""
    from fastapi.responses import FileResponse
    
    if file_type not in ["datasets", "docs"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    base_path = Path(__file__).parent.parent.parent.parent
    file_path = base_path / file_type / filename
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path, filename=filename)