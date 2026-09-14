import os
from pathlib import Path

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
import json
from typing import Annotated, TypedDict

from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langgraph.graph import START, END, StateGraph
from langgraph.graph.message import add_messages

from chatbot.knowledge import load_workflows
from chatbot.prompts import SUPPORT_SYSTEM_PROMPT

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

llm = init_chat_model(
    model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
    api_key=os.environ["OPENAI_API_KEY"],
    model_provider="openai",
    temperature=0,
    max_tokens=500,
    timeout=30,
    max_retries=2,
)


# Shared information passed between nodes
class SupportState(TypedDict):
    role: str
    workflows: list[dict]
    messages: Annotated[list[BaseMessage], add_messages]


# Node 1: Load verified Paw Hub knowledge
def load_knowledge(state: SupportState):
    return {"workflows": load_workflows()}


# Node 2: Answer using the knowledge and conversation
def answer_question(state: SupportState):
    context = json.dumps(
        {
            "authenticated_role": state["role"],
            "workflows": state["workflows"],
        },
        ensure_ascii=False,
    )

    response = llm.invoke(
        [
            SystemMessage(content=SUPPORT_SYSTEM_PROMPT),
            SystemMessage(content="Server-provided Paw Hub context:\n" + context),
            *state["messages"],
        ]
    )

    return {"messages": [response]}


# Build the graph
graph_builder = StateGraph(SupportState)

graph_builder.add_node("load_knowledge", load_knowledge)
graph_builder.add_node("answer_question", answer_question)

graph_builder.add_edge(START, "load_knowledge")
graph_builder.add_edge("load_knowledge", "answer_question")
graph_builder.add_edge("answer_question", END)

graph = graph_builder.compile()


# Run a manual test
if __name__ == "__main__":
    result = graph.invoke(
        {
            "role": "pet_owner",
            "workflows": [],
            "messages": [HumanMessage(content="Has anyone applied to my service yet?")],
        }
    )

    print(result["messages"][-1].content)
