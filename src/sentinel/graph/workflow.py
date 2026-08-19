# src/sentinel/graph/workflow.py
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from sentinel.graph.state import GraphState
from sentinel.graph.nodes import (
    research_analyst_node,
    financial_analyst_node, 
    news_analyst_node,
    compliance_analyst_node,
    supervisor_node, 
    human_approval_node,
    summary_node,
    cancelled_node
)

def route_after_approval(state: GraphState) -> str:
    if state.get("human_approved") is True:
        return "summary"
    return "cancelled"

def build_graph():
    builder = StateGraph(GraphState)

    # 1. Add Nodes
    builder.add_node("research_analyst", research_analyst_node)
    builder.add_node("financial_analyst", financial_analyst_node)
    builder.add_node("news_analyst", news_analyst_node)
    builder.add_node("compliance_analyst", compliance_analyst_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("human_approval", human_approval_node)
    builder.add_node("summary", summary_node)
    builder.add_node("cancelled", cancelled_node)

    # 2. Parallel Fan-Out (4 Specialist Agents)
    builder.add_edge(START, "research_analyst")
    builder.add_edge(START, "financial_analyst")
    builder.add_edge(START, "news_analyst")
    builder.add_edge(START, "compliance_analyst")

    # Fan-In to Supervisor
    builder.add_edge("research_analyst", "supervisor")
    builder.add_edge("financial_analyst", "supervisor")
    builder.add_edge("news_analyst", "supervisor")
    builder.add_edge("compliance_analyst", "supervisor")
    
    # Continue to human approval checkpoint
    builder.add_edge("supervisor", "human_approval")

    # 3. Conditional Routing
    builder.add_conditional_edges(
        "human_approval",
        route_after_approval,
        {
            "summary": "summary",
            "cancelled": "cancelled"
        }
    )

    builder.add_edge("summary", END)
    builder.add_edge("cancelled", END)

    checkpointer = MemorySaver()

    return builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_approval"]
    )

app = build_graph()