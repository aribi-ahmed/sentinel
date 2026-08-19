# src/sentinel/agents/research_agent.py
from typing import Dict, Any
import yfinance as yf

def fetch_entity_baseline(subject_name: str, ticker: str = "") -> Dict[str, Any]:
    """Gathers general baseline identity evidence about the subject entity."""
    evidence = {
        "entity_name": subject_name,
        "ticker": ticker.upper() if ticker else "N/A",
        "sector": "Unknown",
        "industry": "Unknown",
        "country": "Unknown",
        "key_officers": [],
        "business_summary": "No registration summary available."
    }
    
    if ticker and ticker != "N/A":
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            
            officers = []
            for officer in info.get("companyOfficers", [])[:3]:
                officers.append({
                    "name": officer.get("name"),
                    "title": officer.get("title")
                })
                
            evidence.update({
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "country": info.get("country", "Unknown"),
                "key_officers": officers,
                "business_summary": str(info.get("longBusinessSummary", "N/A"))[:300] + "..."
            })
        except Exception:
            pass
            
    return evidence