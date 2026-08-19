import sys
import uuid
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from sentinel.graph.workflow import app

def print_clean_header(title: str):
    print("\n" + "=" * 60)
    print(f" 🛡️  {title.upper()}")
    print("=" * 60)

def format_text(text: str) -> str:
    """Replaces raw literal '\\n' strings with actual newlines."""
    if not text:
        return ""
    return str(text).replace("\\n", "\n").strip()

def run_investigation(ticker: str, subject_name: str):
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_input = {
        "investigation_id": thread_id,
        "ticker": ticker,
        "subject_name": subject_name
    }
    
    print_clean_header(f"Starting Investigation: {subject_name} ({ticker})")
    
    # 1. Run until human approval pause point
    for event in app.stream(initial_input, config):
        for node_name, state_value in event.items():
            if node_name == "__interrupt__":
                continue
            
            print(f"\n⚙️  [Node Executed]: {node_name}")
            if isinstance(state_value, dict) and "logs" in state_value:
                for log in state_value["logs"]:
                    print(f"   └─ {log}")

    # 2. Extract state before approval
    current_state = app.get_state(config)
    risk = current_state.values.get("risk_level", "UNKNOWN")
    reasoning = format_text(current_state.values.get("supervisor_reasoning", "No reasoning provided."))

    print_clean_header("Awaiting Human Compliance Decision")
    print(f"📍 Target Company : {subject_name} ({ticker})")
    print(f"🚨 AI Risk Level  : {risk}")
    print(f"🧠 AI Reasoning   :\n{reasoning}\n")
    print("-" * 60)

    # 3. Interactive CLI Prompt
    user_input = input("👉 Human Compliance Officer — Approve assessment? (y/n): ").strip().lower()
    is_approved = user_input in ["y", "yes"]

    # 4. Resume graph with human decision
    app.update_state(config, {"human_approved": is_approved})
    
    print(f"\n👤 Decision Recorded: {'APPROVED' if is_approved else 'REJECTED'}")
    print("🔄 Finalizing report...\n")

    for event in app.stream(None, config):
        for node_name, state_value in event.items():
            if isinstance(state_value, dict) and "final_report" in state_value:
                print(format_text(state_value["final_report"]))

if __name__ == "__main__":
    run_investigation("PG", "PG Inc.")