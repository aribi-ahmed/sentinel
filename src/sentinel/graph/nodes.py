# src/sentinel/graph/nodes.py
from typing import Dict, Any
from langchain_core.messages import HumanMessage

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
        "news_data": [{"query": subject, "results": str(results)}],
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
    """AI Supervisor Node: Evaluates all gathered intelligence."""
    llm = get_llm(temperature=0.1)
    
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
    2. Classify risk strictly as "LOW" or "ELEVATED".
    3. Provide a clear 2-3 sentence analytical justification referencing policy guidelines.

    Strict Output Format:
    RISK_LEVEL: <LOW or ELEVATED>
    REASONING: <Your analytical reasoning>
    """

    response = llm.invoke([HumanMessage(content=prompt)]).content.strip()

    first_line = response.split("\n")[0].upper()
    risk = "ELEVATED" if "ELEVATED" in first_line or "RISK_LEVEL: ELEVATED" in response.upper() else "LOW"

    return {
        "risk_level": risk,
        "supervisor_reasoning": response,
        "logs": [f"Supervisor AI evaluated risk as '{risk}' based on multi-agent evidence."],
        "requires_human_review": (risk == "ELEVATED")
    }


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