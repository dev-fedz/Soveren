# Agentic AI Planner & Execution System

An enterprise-ready AI Agent framework built on LangChain that can plan, reason, and execute multi-step tasks using safe, sandboxed tools and extensible skills.

## Architecture Overview

1. **Planning**: Decomposes high-level ambiguous goals into structured, dependency-aware multi-step `ExecutionPlan` items. Supports dynamic replanning upon unexpected tool outputs or errors.
2. **Reasoning (ReAct & Chain-of-Thought)**: Explicitly follows a `Thought -> Action -> Observation -> Reflection` cycle to validate intermediate steps before proceeding.
3. **Tool Execution**: Equipped with robust, audited tools for computation, knowledge search, web data retrieval, sandboxed file operations, memory state management, and text summarization.
4. **Custom Skills Framework**: An extensible system that allows the agent to load specialized personas, checklists, and workflows from the `.agents/skills/` directory. This enables the agent to pivot from a general assistant to a specialized expert (e.g., a Security Auditor).
5. **Safety & Guardrails**:
   - Zero shell execution or unconstrained subprocesses (`LC-003`).
   - Domain-allowlisted HTTP requests with anti-SSRF protections (`LC-005`).
   - Explicit finite network timeouts (`LC-007`).
   - Comprehensive docstrings for high model selection accuracy (`LC-019`).
   - Strict iteration and execution time boundaries (`LC-102`).
   - Inlined and transparent agent configuration (`META-003`).

## Capabilities & Tools

### Native Tools
- `calculate_math_expression`: AST-based safe mathematical evaluation without `eval`.
- `search_knowledge_base`: Safe in-memory knowledge store with keyword/category indexing.
- `fetch_web_data`: Controlled HTTP client restricted to fixed vetted service endpoints with finite timeout.
- `read_sandboxed_file`: Sandboxed local workspace file reader with path traversal protection.
- `write_sandboxed_file`: Sandboxed local workspace file writer.
- `manage_memory_store`: Key-value scratchpad memory for cross-step state retention.
- `summarize_content`: Structured text summarizer for distilling large payloads.

### Specialized Skills
The agent utilizes a skills-based architecture located in `.agents/skills/`. Key implementations include:
- **Frontend Vulnerability Check**: Scans frontend code for XSS, CSRF, and insecure storage.
- **Backend Vulnerability Check**: Audits Django-based layered architectures for Broken Access Control, SQLi, and SSRF.

## Running the Agent

### Local Execution
```bash
# Run tests
python3 -m unittest discover -s tests

# Run interactive demo
python3 demo.py
```

### Containerized Background Execution
The agent is Dockerized for CLI-ready background tasks:
```bash
# Build the image
docker-compose build

# Run a specific goal in the background
docker-compose run --rm agent python cli.py --goal "Your task goal here"
```

## Documentation & Playbooks
Detailed operational guides and SOPs are located in the `playbook/` directory, including:
- `FRONTEND_SECURITY_GUIDE.md`: Instructions and templates for frontend audits.
- `BACKEND_SECURITY_GUIDE.md`: Instructions and templates for backend audits.
