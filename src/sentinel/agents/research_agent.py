from typing import Dict, Any
from langchain_core.messages import HumanMessage
from sentinel.services.llm import get_llm

def fetch_entity_baseline(subject_name: str, ticker: str = "") -> Dict[str, Any]:
    llm = get_llm()
    prompt = f"Provide a concise 2-sentence corporate overview for {subject_name} (Ticker: {ticker or 'N/A'}). State main sector and core business focus."
    try:
        summary = llm.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        summary = f"Research error: {str(e)}"
    
    return {
        "entity_name": subject_name,
        "ticker": ticker.upper() if ticker else "N/A",
        "business_summary": summary
    }