# 🌐 Frontend Agent: Skill & Command Reference

This guide provides the commands and prompts you can use to trigger the specific professional frontend skills integrated into your Planner-Agent.

## 🚀 How to Invoke Skills
Since the agent uses a **Planner**, you don't necessarily need to call tools by their technical names. You can use **Natural Language** in your goal, and the Planner will automatically map them to the correct tool.

### 1. The "Human-Touch" Suite (UI/UX)
Use these keywords in your goal to ensure the website doesn't look "AI-generated."

| Goal Keyword | Tool Triggered | What it does |
| :--- | :--- | :--- |
| **"Audit design system"** | `validate_design_system` | Checks for "magic numbers" and inconsistent spacing/colors. |
| **"Check accessibility"** | `audit_ux_accessibility` | Finds missing alt tags, aria-labels, and keyboard navigation issues. |
| **"Refine UI nuance"** | `refine_ui_nuance` | Removes AI patterns (excessive rounding, generic centering) and adds professional depth. |

**Example Prompt:**
> *"Create a pricing section for my SaaS, then **refine the UI nuance** and **audit the accessibility** to make it look professional and human-made."*

---

### 2. Web Research & Knowledge
Use these when the agent needs real-world data or reference patterns.

| Goal Keyword | Tool Triggered | What it does |
| :--- | :--- | :--- |
| **"Web search"** | `web_search` | Searches the live web for current trends, competitors, or documentation. |
| **"Knowledge base"** | `search_knowledge_base` | Looks up local project standards, architecture rules, or formulas. |
| **"Fetch data"** | `fetch_web_data` | Gets structured data from vetted APIs (Weather, Crypto, etc.). |

**Example Prompt:**
> *"**Web search** for the best-converting landing page layouts for AI tools in 2026, then create a React component based on those findings."*

---

### 3. Core Execution Tools
These are the "workhorse" tools used for the actual build process.

| Tool Name | Use Case | Expected Output |
| :--- | :--- | :--- |
| `write_sandboxed_file` | Saving components, CSS, or reports. | Confirmation of file saved to `/workspace`. |
| `read_sandboxed_file` | Reading existing code to modify it. | The source code of the target file. |
| `summarize_content` | Distilling long research into bullet points. | A concise list of key takeaways. |
| `manage_memory_store` | Remembering a color palette or API key across steps. | Confirmation of stored key/value. |
| `delete_sandboxed_path` | Removing old versions, test directories, or cleaning the workspace. | Confirmation of deletion. |

---

## 🌟 The "Master Build" Command (High-Detail Template)

If you want the agent to build a complete, production-ready application without recurring bugs or "AI-ish" gaps, use a highly specific prompt. 

**Copy and paste this template, filling in the brackets:**

> **"Start a new frontend project. First, ask me for:
> 1. Project Name and Core Purpose.
> 2. Framework preference (e.g., Next.js App Router, Vite+React).
> 3. Styling preference (e.g., Tailwind CSS, CSS Modules).
> 4. Design Direction (e.g., Minimalist, Enterprise SaaS, Playful/Modern).
> 5. Layout Type (e.g., Dashboard with Sidebar, Multi-page Landing, Single Page App).
> 6. API Endpoints and Data Structures for connections.
> 7. Authentication Requirements (e.g., JWT, OAuth, NextAuth).
> 
> Once confirmed, execute the following workflow:
> - Build a full Auth suite: Login, Register, Forgot Password, and Change Password pages with form validation.
> - Create a library of custom reusable components (Buttons, Inputs, Modals, Cards) that follow a strict design system.
> - Implement a professional Data Table featuring:
>   - API-connected data fetching.
>   - Workable dropdowns for filtering/actions.
>   - Robust pagination and sorting.
> - Perform a 'Refine UI Nuance' and 'UX Accessibility' audit on every page.
> - Ensure zero 'magic numbers' in CSS.
> - Save all files to the workspace and provide a final summary report of the architecture."**

### 🏁 Summary of Workflow
`User Inputs` $\rightarrow$ `Architecture Planning` $\rightarrow$ `Auth Suite` $\rightarrow$ `Reusable Components` $\rightarrow$ `Data Table/API` $\rightarrow$ `Nuance/a11y Audit` $\rightarrow$ `File Save`
