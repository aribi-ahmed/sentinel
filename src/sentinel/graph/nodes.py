# src/sentinel/graph/nodes.py
from typing import Dict, Any
from langchain_core.messages import HumanMessage
import re
from sentinel.graph.state import GraphState
from sentinel.services.llm import get_llm
from sentinel.tools.finance import fetch_company_financials
from sentinel.tools.osint import search_company_news
from sentinel.tools.rag import query_compliance_policy
from sentinel.agents.research_agent import fetch_entity_baseline


def research_analyst_node(state: GraphState) -> Dict[str, Any]:
    """Research Agent Node: Establishes corporate baseline identity and leadership."""
    subject = state.get("subject_name") or "Target Entity"
    ticker = state.get("ticker") or ""
    
    baseline = fetch_entity_baseline(subject_name=subject, ticker=ticker)
    return {
        "research_data": [baseline],
        "logs": [f"Research Agent gathered baseline profile for {subject}."]
    }


def financial_analyst_node(state: GraphState) -> Dict[str, Any]:
    """Node that extracts live financial metrics using stock ticker."""
    ticker = state.get("ticker") or "TSLA"
    data = fetch_company_financials.invoke({"ticker": ticker})
    return {
        "financial_data": data,
        "logs": [f"Financial Analyst pulled market data for ticker: {ticker}."]
    }


def news_analyst_node(state: GraphState) -> Dict[str, Any]:
    """Node that searches live web OSINT."""
    subject = state.get("subject_name") or state.get("ticker") or "Target Company"
    results = search_company_news.invoke({"query": subject})
    return {
        "news_data": [{"query": subject, "results": results if isinstance(results, list) else str(results)}],
        "logs": [f"News Analyst gathered OSINT search results for {subject}."]
    }


def compliance_analyst_node(state: GraphState) -> Dict[str, Any]:
    """Node that uses local Vector RAG to query internal risk policy rules."""
    subject = state.get("subject_name") or state.get("ticker") or "Target Entity"
    query = f"Risk standards for evaluation of valuation, debt, and litigation for {subject}"
    
    rag_results = query_compliance_policy.invoke({"query": query})
    return {
        "compliance_data": [str(rag_results)],
        "logs": [f"Compliance RAG Analyst queried internal policy store for {subject}."]
    }


def supervisor_node(state: GraphState) -> Dict[str, Any]:
    """AI Supervisor Node: Evaluates all gathered intelligence with confidence scoring."""
    llm = get_llm(model_name="llama-3.1-8b-instant", temperature=0.1)
    
    subject = state.get("subject_name") or state.get("ticker") or "Target Company"
    research = state.get("research_data", [])
    financials = state.get("financial_data", {})
    news = state.get("news_data", [])
    compliance_rules = state.get("compliance_data", [])

    prompt = f"""
You are the Chief Risk Officer for SENTINEL AI.
Analyze the gathered intelligence for company: {subject}

RESEARCH BASELINE:
{research}

FINANCIAL DATA:
{financials}

NEWS & OSINT FINDINGS:
{news}

INTERNAL COMPLIANCE RAG POLICIES:
{compliance_rules}

TASK:
1. Cross-reference financial metrics and OSINT news against internal compliance risk policies.
2. Classify risk strictly as "LOW" or "ELEVATED". If financials and news are generally stable without major regulatory probes or auditor resignations, mark as "LOW".
3. Provide a clear 2-3 sentence analytical justification referencing policy guidelines.
4. CONFIDENCE: Evaluate your confidence in this assessment on a scale of 0-100. 
   - High confidence (80-100): Clear evidence, multiple sources agree, strong indicators
   - Medium confidence (50-79): Mixed evidence, some uncertainty, reasonable conclusion
   - Low confidence (0-49): Conflicting data, insufficient evidence, speculative

STRICT FORMAT REQUIREMENTS:
Start your response on the very first line with EXACTLY one of these options:
VERDICT: LOW
or
VERDICT: ELEVATED

Then provide REASONING: <Your analytical reasoning> below it.
Then provide CONFIDENCE: <0-100> (a single number representing your certainty percentage)
"""

    response = llm.invoke([HumanMessage(content=prompt)]).content.strip()

    # Extract VERDICT
    match = re.search(r"VERDICT:\s*(LOW|ELEVATED)", response, re.IGNORECASE)
    if match:
        risk = match.group(1).upper()
    else:
        first_line = response.split("\n")[0].upper()
        risk = "ELEVATED" if "ELEVATED" in first_line else "LOW"

    # Extract CONFIDENCE score (0-100)
    confidence_match = re.search(r"CONFIDENCE:\s*(\d+)", response, re.IGNORECASE)
    confidence_score = 0.0
    if confidence_match:
        confidence_value = int(confidence_match.group(1))
        confidence_score = min(100, max(0, confidence_value)) / 100.0  # Normalize to 0-1
    else:
        # Fallback: calculate confidence based on evidence quality
        confidence_score = calculate_confidence_from_evidence(research, financials, news, compliance_rules, risk)

    return {
        "risk_level": risk,
        "supervisor_reasoning": response,
        "confidence": confidence_score,
        "logs": [f"Supervisor AI evaluated risk as '{risk}' (confidence: {confidence_score:.1%}) based on multi-agent evidence."],
        "requires_human_review": (risk == "ELEVATED")
    }


def calculate_confidence_from_evidence(research: list, financials: dict, news: list, compliance_rules: list, risk_level: str) -> float:
    """Calculate confidence score based on evidence quality and availability."""
    confidence = 0.5  # Start at 50%
    
    # +10% for each data source that contributed meaningful data
    if research and len(research) > 0 and any(r for r in research if r):
        confidence += 0.10
    if financials and len(financials) > 0:
        confidence += 0.10
    if news and len(news) > 0 and any(n for n in news if n):
        confidence += 0.10
    if compliance_rules and len(compliance_rules) > 0 and any(c for c in compliance_rules if c):
        confidence += 0.10
    
    # +5% for consistency if ELEVATED (multiple sources flagging issues) or LOW (all clear)
    if risk_level == "ELEVATED":
        # More confidence if multiple sources show risk signals
        risk_indicators = 0
        for source_data in [research, financials, news, compliance_rules]:
            if source_data and str(source_data).lower().count(('risk' or 'concern' or 'issue' or 'problem')) > 0:
                risk_indicators += 1
        if risk_indicators >= 2:
            confidence += 0.05
    else:
        # More confidence if all sources indicate stability
        all_clear = True
        for source_data in [research, financials, news, compliance_rules]:
            if source_data and str(source_data).lower().count(('alert' or 'warning' or 'elevated' or 'concern')) > 0:
                all_clear = False
        if all_clear:
            confidence += 0.05
    
    # Ensure confidence stays between 0 and 1
    return min(1.0, max(0.0, confidence))


def human_approval_node(state: GraphState) -> Dict[str, Any]:
    """Checkpoint node for Human-in-the-Loop review."""
    return {
        "logs": [f"Human Checkpoint reached. Approved: {state.get('human_approved')}"]
    }


def summary_node(state: GraphState) -> Dict[str, Any]:
    """Generates the final approved risk report."""
    subject = state.get('subject_name') or state.get('ticker')
    ticker = state.get("ticker", "N/A")
    risk_level = state.get('risk_level', "UNKNOWN")
    
    raw_reasoning = state.get('supervisor_reasoning', 'Approved by supervisor.')
    clean_reasoning = raw_reasoning.replace("RISK_LEVEL: ELEVATED", "").replace("REASONING:", "").strip()
    
    formatted_report = f"""### 🛡️ SENTINEL APPROVED RISK REPORT

**Target Entity:** **{subject} ({ticker})**  
**Risk Level:** `{risk_level}` | **Human Approved:** `True`

---

#### 🧠 AI Reasoning & Findings
{clean_reasoning}
"""
    return {
        "final_report": formatted_report,
        "logs": ["Approved structured report generated successfully."]
    }


def cancelled_node(state: GraphState) -> Dict[str, Any]:
    """Handles workflow cancellation when human rejects assessment."""
    subject = state.get('subject_name') or state.get('ticker')
    ticker = state.get("ticker", "N/A")
    risk_level = state.get('risk_level', "UNKNOWN")
    
    formatted_report = f"""### 🛑 SENTINEL CANCELLED RISK REPORT

**Target Entity:** **{subject} ({ticker})**  
**Risk Level:** `{risk_level}` | **Human Approved:** `False`  
**Status:** Rejected by Human Compliance Officer  

---
Workflow was intentionally halted. No further action required.
"""
    return {
        "final_report": formatted_report,
        "logs": ["Workflow cancelled by human approval checkpoint."]
    }