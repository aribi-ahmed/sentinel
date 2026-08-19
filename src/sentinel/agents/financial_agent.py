from typing import Dict, Any
from sentinel.tools.finance import fetch_company_financials
from sentinel.services.llm import get_llm

def run_financial_analysis(company_name: str, ticker: str = "") -> Dict[str, Any]:
    llm = get_llm()
    llm_with_tools = llm.bind_tools([fetch_company_financials])
    
    prompt = f"Analyze the financial health of {company_name} (ticker: {ticker}). Call the financial tool using its stock ticker."
    
    response = llm_with_tools.invoke(prompt)
    
    if response.tool_calls:
        tool_call = response.tool_calls[0]
        data = fetch_company_financials.invoke(tool_call["args"])
        return {"summary": f"Fetched data for {ticker}", "raw_data": data}
    
    return {"summary": response.content, "raw_data": {}}