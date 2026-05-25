export const CONTINUITY_IMPORT_FILE_PROMPT = `Generate a ContinuityOS Import File for this current chat/project.
Rules:
- Do not invent missing facts.
- If unknown, write UNKNOWN.
- Extract the current objective, stable facts, decisions, open issues, recent progress, next steps, and important context for a future AI.
- Include recent conversation excerpts only when they are useful.
- Optimize for helping a new AI chat continue where we left off.
- Return only the import file in markdown.
Use this format:
# CONTINUITYOS IMPORT FILE
version: 1
source_ai: <AI platform>
generated_at: <timestamp or UNKNOWN>
project_name: <project name or UNKNOWN>
project_type: <project type or UNKNOWN>
## CURRENT OBJECTIVE
...
## CONTINUITY SUMMARY
...
## STABLE FACTS
- ...
## RECENT PROGRESS
- ...
## DECISIONS MADE
- ...
## OPEN ISSUES
- ...
## NEXT STEPS
- ...
## IMPORTANT CONTEXT FOR NEXT AI
...
## RECENT CONVERSATION EXCERPTS
...
## TEST / BUILD / GIT STATUS
...
## RISKS / WARNINGS
...
## RULES FOR FUTURE AI
- Do not assume missing facts.
- Ask questions when project truth is unknown.
- Preserve existing decisions.
- Keep steps copy/paste-ready when relevant.`;
