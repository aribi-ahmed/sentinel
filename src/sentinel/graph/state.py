# src/sentinel/graph/state.py
import operator
from typing import Annotated, Any, Dict, List, Optional, TypedDict

def merge_dicts(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    """Reducer that merges dictionary results from parallel agent nodes."""
    return {**left, **right}

class GraphState(TypedDict):
    """The shared central state passed between every agent node in SENTINEL."""
    investigation_id: Optional[str]
    subject_name: Optional[str]
    ticker: Optional[str]

    # Specialist Agent Collected Data
    research_data: Annotated[List[Dict[str, Any]], operator.add]
    financial_data: Annotated[Dict[str, Any], merge_dicts]
    compliance_data: Annotated[List[str], operator.add]
    news_data: Annotated[List[Dict[str, Any]], operator.add]

    # Supervisor Analysis
    risk_level: Optional[str]
    supervisor_reasoning: Optional[str]
    confidence: Optional[float]  # Confidence score 0.0-1.0 (certainty of risk assessment)

    # Human-in-the-Loop & Approval Flags
    requires_human_review: bool
    human_approved: Optional[bool]

    # Final Output
    final_report: Optional[str]

    # Error & Audit Logging
    logs: Annotated[List[str], operator.add]
    errors: Annotated[List[str], operator.add]