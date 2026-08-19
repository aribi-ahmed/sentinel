import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

# 1. Import your two tools
from sentinel.tools.rag import query_compliance_rag
from sentinel.tools.sanctions import check_sanctions_and_watchlists

load_dotenv()

# 2. Bundle your tools together in a list
agent_tools = [
    query_compliance_rag,            # For PDFs / Policy rules in ChromaDB
    check_sanctions_and_watchlists   # For OFAC / OpenSanctions CSVs
]

# 3. Create the LLM and bind the tools to it
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# Binding tools exposes them to OpenAI Function Calling
llm_with_tools = llm.bind_tools(agent_tools)


def run_compliance_check(query: str):
    """
    Passes a prompt to the LLM. The LLM returns tool calls 
    depending on what information it needs.
    """
    messages = [
        SystemMessage(content=(
            "You are an Enterprise Compliance Agent. "
            "Use 'check_sanctions_and_watchlists' for company/individual screening. "
            "Use 'query_compliance_rag' for internal rules, policies, and frameworks."
        )),
        HumanMessage(content=query)
    ]

    # Ask the LLM
    response = llm_with_tools.invoke(messages)

    # Check which tool(s) the LLM decided to execute
    if response.tool_calls:
        print("🤖 Agent decided to invoke the following tools:")
        for tool_call in response.tool_calls:
            print(f"  - Tool Name: {tool_call['name']}")
            print(f"  - Tool Arguments: {tool_call['args']}")
            
            # Execute the selected tool function
            if tool_call['name'] == 'check_sanctions_and_watchlists':
                result = check_sanctions_and_watchlists.invoke(tool_call['args'])
                print(f"  - Tool Result:\n{result}\n")
            elif tool_call['name'] == 'query_compliance_rag':
                result = query_compliance_rag.invoke(tool_call['args'])
                print(f"  - Tool Result:\n{result}\n")
    else:
        print("🤖 Agent answered directly without needing tools:")
        print(response.content)


# --- TEST RUNS ---
if __name__ == "__main__":
    print("--- TEST 1: Asking about Sanctions (Triggers CSV Tool) ---")
    run_compliance_check("Check if 'Sberbank' or 'Tesla' is on any sanction list.")

    print("\n--- TEST 2: Asking about Policy (Triggers RAG Tool) ---")
    run_compliance_check("What are our NIST guidelines for password and data security?")