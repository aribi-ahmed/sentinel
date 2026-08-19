import operator
from typing import TypedDict, Optional, List, Dict, Any, Annotated

class GraphState(TypedDict, total=False):
    investigation_id: str
    subject_name: str
    ticker: str
    research_data: List[Dict[str, Any]]
    financial_data: Dict[str, Any]
    news_data: List[Dict[str, Any]]
    compliance_data: List[str]
    risk_level: str
    supervisor_reasoning: str
    confidence: float
    requires_human_review: bool
    human_approved: Optional[bool]
    final_report: str
    # Written concurrently by all 4 parallel specialist nodes each superstep,
    # so it needs a reducer to merge writes instead of the default
    # last-value-wins channel (which raises on concurrent updates).
    logs: Annotated[List[str], operator.add]