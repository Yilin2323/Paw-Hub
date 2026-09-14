import json
from pathlib import Path


KNOWLEDGE_PATH = Path(__file__).with_name("knowledge.json")


def load_workflows():
    with KNOWLEDGE_PATH.open("r", encoding="utf-8") as file:
        knowledge = json.load(file)

    workflows = knowledge.get("workflows")

    if not isinstance(workflows, list):
        raise ValueError("knowledge.json must contain a 'workflows' array.")

    return workflows
