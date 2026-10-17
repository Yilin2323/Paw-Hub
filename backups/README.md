# Preserved LangGraph chatbot

`langgraph-chatbot-2026-10-13.zip` is an inactive source snapshot taken immediately
before the rule-based conversion. It is not imported or served by Flask.

The snapshot includes the original `chatbot/graph.py`, prompts, tool implementations,
knowledge, chatbot tests, dependency list, frontend, README, and surrounding project
source so the old version can be restored independently. `BACKUP_MANIFEST.json`
contains a SHA-256 checksum for every archived file. All 73 file checksums were
verified after creation. The archive excludes `.env`, the database, installed
environments, and Git history. Keep a separate copy of this archive somewhere safe.

## Restore in a separate folder

1. Extract the ZIP into a NEW empty folder. Do not extract it over a newer working
   project: it is a complete historical source snapshot and would replace later fixes.
2. Create and activate a new Python virtual environment in that folder.
3. Install the archived `requirements.txt` using `python -m pip install -r requirements.txt`.
4. Create your own `.env` with a new `FLASK_SECRET_KEY` and `OPENAI_API_KEY`; optionally
   set `OPENAI_MODEL`. Use mail settings only if needed. Keys are not included here.
5. For disposable demo data ONLY, run `python init_db.py` in that restored folder.
   This initializer deletes existing tables. Never run it on a database you need to keep.
   Demo dates in the snapshot may be past dates; adjust them for new demonstrations.
6. Run `python app.py`. On macOS the default port is 5001; stop any other server
   using that port first, or choose another `PORT` value.

To restore only the chatbot into a later version, compare and merge the archived
chatbot directory, `/chatbot/message` route in `app.py`, requirements, tests, and
chat UI deliberately. There is no hidden runtime switch that enables models in
the current application. Old dependencies are not fully version-pinned; restoring
the source does not guarantee future third-party API compatibility.

For a no-model school submission, use the active rule-based source and exclude
this optional historical backup if your supervisor requires no model code in the
submitted package. The archive preserves the original implementation; it is not
a claim that the original was rule-based.
