from langchain_community.tools import DuckDuckGoSearchResults
from langchain_core.tools import tool


@tool
def search_company_news(query: str) -> str:
    """
    Searches recent web news and corporate announcements for risk analysis, 
    sanctions, legal controversies, or executive changes.
    """
    search_tool = DuckDuckGoSearchResults(num_results=5)
    try:
        return search_tool.run(f"{query} recent controversies legal issues financial risk")
    except Exception as e:
        return f"News search failed: {str(e)}"