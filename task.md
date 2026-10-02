Yes. Your new idea is essentially turning the editor from an **AI coding assistant** into a **fully autonomous software-development workspace** where the agent can code → run → inspect → test → navigate → debug → verify, while asking the user only when human interaction/permission is genuinely required.

For Opus 4.6, I would give it a large architectural prompt rather than asking it to implement individual buttons. Use this as a single prompt:

````markdown
# AI Native Editor — Autonomous Agent Workspace & Full UI Interaction System

You are working on an AI Native Editor.

The editor is Docker-based and must be designed to work for different users, projects, operating systems, and technology stacks.

The goal is to evolve the current editor from a coding/chat interface into a **fully interactive autonomous software-development environment**.

The AI agent should be able to:

```text
Understand task
    ↓
Inspect project
    ↓
Plan
    ↓
Create/update files
    ↓
Navigate the project UI
    ↓
Run project
    ↓
Open application
    ↓
Inspect UI
    ↓
Perform automated tests
    ↓
Inspect console/network/etc.
    ↓
Detect failures
    ↓
Modify code
    ↓
Re-run
    ↓
Verify
    ↓
Report completion
````

The user should be mostly hands-off.

The AI should perform the work itself and only interrupt the user when human input or authorization is genuinely required.

---

# IMPORTANT: DO NOT IMPLEMENT THIS AS A COLLECTION OF UI HACKS

Before changing the codebase, inspect the entire architecture.

Understand:

* AI agent
* agent loop
* tools
* skills
* project filesystem
* file explorer
* code editor
* Browser
* process manager
* Docker execution
* service discovery
* chat
* streaming
* permissions
* existing automation
* existing browser implementation
* existing file/document handling

Do not replace working infrastructure unnecessarily.

Extend the existing architecture where appropriate.

The final implementation should be a coherent platform rather than a set of special cases.

---

# PRODUCT VISION

The AI Native Editor should behave conceptually like this:

```text
┌───────────────────────────────────────────────────────────────────┐
│ AI Native Editor                                                  │
├───────────────┬───────────────────────────────────────────────────┤
│               │                                                   │
│ Project       │  Workspace                                       │
│ Explorer      │                                                   │
│               │  ┌────────┬─────────┬────────┬────────┬────────┐ │
│               │  │ Code   │ Browser │ Images │ Docs   │ Inspect│ │
│               │  └────────┴─────────┴────────┴────────┴────────┘ │
│               │                                                   │
│               │                                                   │
│               │           Active workspace                        │
│               │                                                   │
├───────────────┤                                                   │
│               │                                                   │
│ Project Chat  │                                                   │
│               │                                                   │
└───────────────┴───────────────────────────────────────────────────┘
```

The agent should be able to control the workspace.

The workspace should visually follow what the agent is doing.

---

# CORE PRINCIPLE — AGENT IS THE DRIVER

The user should not have to manually navigate the editor while the agent is working.

When the agent:

* opens a file
* creates a file
* edits a file
* runs a command
* starts a service
* opens a website
* inspects an element
* runs a test
* examines console errors
* checks network requests
* reads a document
* views an image

the UI should automatically follow the agent's current activity.

The user should be able to watch the work happen.

---

# SCENARIO 1 — IMPLEMENT A FEATURE

Example user request:

```text
Add a forgot-password feature to the existing application.
```

The agent should autonomously:

```text
1. Understand the request
2. Inspect project structure
3. Identify frontend
4. Identify backend
5. Inspect relevant existing code
6. Plan implementation
7. Create/update files
8. Run formatting/type checking
9. Start/restart required services
10. Open the frontend
11. Navigate to the relevant UI
12. Perform automated testing
13. Inspect console/network if needed
14. Fix discovered issues
15. Re-test
16. Verify final behavior
17. Report result
```

The user should not need to manually open files or tabs.

---

# FILE NAVIGATION — AGENT CONTROLLED

When the agent creates or edits a file, the editor should automatically navigate to that file.

Example:

```text
Agent:
Create:
src/components/ForgotPassword.tsx
```

The editor should automatically:

```text
Project Explorer
    ↓
withgod-fe
    ↓
src
    ↓
components
    ↓
ForgotPassword.tsx
```

The selected file should be visually highlighted.

The Code tab should automatically become active.

The code editor should open:

```text
ForgotPassword.tsx
```

and optionally scroll to the relevant changed region.

The user should visually see where the agent is working.

---

# FILE CREATION VISUALIZATION

When a new file is created, the project tree should automatically reveal it.

Example:

```text
withgod-fe
 └── src
      └── components
           └── ForgotPassword.tsx  ← selected
```

The editor should provide a subtle visual indication such as:

```text
Created
Modified
Deleted
```

Do not make this distracting.

---

# CODE TAB AUTOMATION

When the agent is working on source code:

```text
Active workspace = Code
```

When the agent opens a file:

```text
Code tab
→ file automatically selected
```

When the agent wants to inspect the application:

```text
Browser tab
→ automatically selected
```

When the agent wants to inspect browser internals:

```text
Inspect tab
→ automatically selected
```

When the agent opens an image:

```text
Images tab
→ automatically selected
```

When the agent opens a document:

```text
Docs tab
→ automatically selected
```

The workspace should follow the agent's current task.

---

# AGENT NAVIGATION EVENTS

Introduce a unified workspace navigation/event system.

Conceptually:

```ts
type AgentWorkspaceAction =
  | {
      type: "open_file";
      path: string;
      line?: number;
      column?: number;
    }
  | {
      type: "create_file";
      path: string;
    }
  | {
      type: "open_browser";
      serviceId: string;
      url?: string;
    }
  | {
      type: "open_image";
      path: string;
    }
  | {
      type: "open_document";
      path: string;
    }
  | {
      type: "open_inspector";
      target?: string;
    }
  | {
      type: "focus_console";
    }
  | {
      type: "focus_network";
    };
```

Do not scatter direct UI state mutations throughout the agent implementation.

Create a proper workspace-control abstraction.

---

# AGENT SHOULD BE ABLE TO CONTROL THE EDITOR

The agent should have tools that represent meaningful actions.

For example:

```text
open_file
create_file
modify_file
delete_file
open_browser
navigate_browser
inspect_element
run_browser_script
take_screenshot
inspect_console
inspect_network
inspect_storage
run_automation_test
open_image
open_document
```

The agent should not need to manipulate React state directly.

The agent should call tools.

The tools should produce structured results.

---

# BROWSER AUTOMATION

The Browser must become a real automation environment.

The agent should be able to:

```text
navigate
click
type
select
hover
scroll
wait
press keys
upload files
download files
read visible text
inspect DOM
take screenshots
execute JavaScript when appropriate
```

Use a robust browser automation architecture such as Playwright/CDP or the existing browser automation system if one already exists.

Do not implement browser automation using fragile coordinate clicking.

Prefer semantic selectors:

```text
role
text
label
placeholder
aria
CSS
DOM attributes
```

Coordinates should only be a fallback when necessary.

---

# BROWSER AGENT FLOW

Example:

User:

```text
Add a login page and make sure users can log in.
```

Agent:

```text
1. Modify code
2. Start frontend/backend
3. Open Browser
4. Navigate to login page
5. Inspect page
6. Locate email field
7. Locate password field
8. Determine whether credentials are required
```

If credentials are needed:

```text
Agent:
I need you to enter your credentials to continue the test.

[Username field]
[Password field]

[Continue]
```

The agent must pause.

After the user provides/authorizes the interaction:

```text
Agent resumes
    ↓
Continue test
```

---

# HUMAN-IN-THE-LOOP PERMISSIONS

The system must support explicit user approval.

The agent must NOT blindly perform sensitive actions.

Examples that require user interaction or approval:

```text
Username
Password
2FA code
OTP
CAPTCHA
payment
external account authorization
destructive operation
production deployment
sending external communication
access to sensitive files
```

The agent should be able to pause its execution.

Represent this explicitly:

```ts
type AgentPermissionRequest = {
  id: string;
  type:
    | "credential"
    | "confirmation"
    | "external_access"
    | "destructive_action"
    | "captcha"
    | "otp";
  title: string;
  explanation: string;
  required: boolean;
  fields?: PermissionField[];
};
```

The UI should show a clear permission modal.

Example:

```text
┌─────────────────────────────────────────────┐
│ Agent needs your input                      │
├─────────────────────────────────────────────┤
│ The application requires authentication    │
│ to continue automated testing.              │
│                                             │
│ Username: [________________________]        │
│ Password: [________________________]        │
│                                             │
│          [Cancel] [Continue]                │
└─────────────────────────────────────────────┘
```

Never expose credentials to the model unnecessarily.

Prefer secure credential injection.

---

# AGENT PAUSE / RESUME

The agent execution engine must support:

```text
running
waiting_for_user
paused
resuming
completed
failed
cancelled
```

Example:

```text
Agent
 ↓
Browser automation
 ↓
Login required
 ↓
WAITING_FOR_USER
 ↓
User provides credentials
 ↓
RESUME
 ↓
Continue browser automation
```

Do not restart the entire task.

The agent should continue from the same execution state.

---

# AUTOMATED UI TESTING

The agent must be capable of performing actual automated testing.

This is NOT simply:

```text
open URL
```

It should be able to verify behavior.

Example:

```text
Navigate:
http://localhost:3001/login

Find:
Email input

Fill:
test@example.com

Find:
Password input

Fill:
••••••••

Click:
Login

Wait:
Dashboard

Assert:
"Welcome back"

Assert:
URL contains /dashboard
```

The result should be structured:

```json
{
  "success": true,
  "steps": [
    {
      "action": "navigate",
      "status": "passed"
    },
    {
      "action": "fill",
      "status": "passed"
    },
    {
      "action": "click",
      "status": "passed"
    },
    {
      "action": "assert",
      "status": "passed"
    }
  ]
}
```

---

# TEST FAILURE HANDLING

If automation fails:

```text
Agent
 ↓
Test failed
 ↓
Inspect screenshot
 ↓
Inspect DOM
 ↓
Inspect console
 ↓
Inspect network
 ↓
Reason about failure
 ↓
Modify code
 ↓
Restart service if required
 ↓
Run test again
```

The agent should be capable of iterative debugging.

---

# AUTOMATION TEST ARTIFACTS

Every automated test should optionally generate:

```text
screenshot
DOM snapshot
console output
network information
trace
video
timings
test result
```

Associate these artifacts with the current agent task.

Example:

```text
Agent Task
└── Forgot Password
    ├── screenshot.png
    ├── console.log
    ├── network.json
    ├── trace.zip
    └── test-result.json
```

---

# NEW MODULE — INSPECT

Add a new top-level workspace tab:

```text
Code
Browser
Inspect
Images
Docs
```

The Inspect module is intended to provide browser developer-tools-like capabilities to the AI agent and user.

It should contain:

```text
Elements
Console
Network
Performance
Memory
Application
Security
```

---

# INSPECT — ELEMENTS

Elements should allow the agent/user to inspect:

```text
DOM tree
HTML
attributes
classes
computed styles
bounding box
accessibility information
```

When the agent identifies an element during automation, the Inspect panel should be able to highlight it.

Example:

```text
Browser
    ↓
Agent clicks Login
    ↓
Inspect
    ↓
Elements
    ↓
<button id="login">
```

The editor should visually connect the browser element with the inspector.

---

# INSPECT — CONSOLE

Show:

```text
console.log
console.info
console.warn
console.error
uncaught exceptions
unhandled promise rejections
```

The agent should be able to query console output.

Example:

```text
Agent:
Check console errors.

Inspect → Console

ERROR:
Failed to fetch /api/users
```

The agent can then use this information for debugging.

---

# INSPECT — NETWORK

Show network requests:

```text
method
URL
status
duration
request headers
response headers
request payload
response payload where safe
initiator
resource type
```

Support filtering:

```text
Fetch/XHR
Document
JS
CSS
Images
Fonts
WebSocket
```

The agent should be able to ask:

```text
inspect_network
```

and receive structured data.

Example:

```json
{
  "request": "GET /api/users",
  "status": 500,
  "durationMs": 120,
  "type": "fetch"
}
```

This allows the agent to diagnose frontend/backend integration failures.

---

# INSPECT — PERFORMANCE

Support browser performance information where technically available.

Expose:

```text
navigation timing
resource timing
page load timing
long tasks
CPU-related information where available
```

Do not claim information that the browser cannot reliably provide.

---

# INSPECT — MEMORY

Expose browser memory information where supported.

Examples:

```text
JS heap
used heap
total heap
heap limit
```

If a browser/runtime does not expose a metric, clearly show:

```text
Not available in this browser/runtime.
```

Do not fabricate metrics.

---

# INSPECT — APPLICATION

Expose useful application state:

```text
localStorage
sessionStorage
cookies
IndexedDB
cache storage
service workers
```

Sensitive values must be protected.

Do not automatically send secrets to the model.

The agent should only receive the minimum required information.

---

# INSPECT — SECURITY

Show relevant browser security information where available:

```text
HTTPS
certificate
mixed content
CSP
CORS
security warnings
blocked resources
```

Again:

Do not fabricate browser security data.

---

# INSPECT SHOULD WORK WITH AUTOMATION

The key architecture is:

```text
Browser
   │
   ├── DOM
   ├── Console
   ├── Network
   ├── Performance
   ├── Storage
   └── Security
        │
        ▼
     Inspector
        │
        ▼
       Agent
```

The same browser session used by the automation engine should be connected to Inspect.

Do not create a separate browser instance for Inspect.

Otherwise the agent may inspect a different page/session than the one being tested.

---

# BROWSER + INSPECT SYNCHRONIZATION

When the agent navigates:

```text
Browser updates
Inspect updates
```

When the agent selects an element:

```text
Elements highlights it
Browser highlights it
```

When a console error occurs:

```text
Console count badge increases
```

When a network request fails:

```text
Network count badge increases
```

Example:

```text
Code
Browser
Inspect (3)
Images
Docs
```

---

# NEW MODULE — IMAGES

Add:

```text
Images
```

as a top-level workspace tab.

The purpose is to allow the agent and user to view image files from the project.

Supported formats should include common formats such as:

```text
PNG
JPG/JPEG
GIF
WEBP
SVG
BMP
```

The system should detect image files automatically.

When the agent opens an image:

```text
Agent
 ↓
open_image(path)
 ↓
Images tab automatically activated
 ↓
Image displayed
```

The project explorer should visually select the image.

---

# IMAGE INSPECTION

The image viewer should support:

```text
zoom
fit
pan
actual size
image dimensions
file size
format
transparency information where available
```

For SVG, display safely.

Do not execute arbitrary SVG scripts.

---

# IMAGE ANALYSIS

The agent should be able to inspect images.

Examples:

```text
open image
analyze image
compare image
inspect dimensions
```

This is useful for:

```text
UI screenshots
design assets
icons
logos
generated images
test screenshots
```

---

# AUTOMATION SCREENSHOTS → IMAGES

When browser automation produces a screenshot:

```text
automation
 ↓
screenshot
 ↓
Images tab
```

The agent should be able to open the screenshot automatically when debugging a visual failure.

Example:

```text
Test failed.

Reason:
Button was not found.

Screenshot captured.

→ Open screenshot
```

The editor switches to Images.

---

# NEW MODULE — DOCS

Add:

```text
Docs
```

as a top-level workspace tab.

The Docs module should support project documents such as:

```text
PDF
DOC
DOCX
XLS
XLSX
CSV
TXT
MD
RTF
```

where technically supported.

---

# DOCUMENT VIEWER

When the agent opens:

```text
README.pdf
```

the editor should:

```text
select file
 ↓
Docs tab
 ↓
render document
```

For spreadsheets:

```text
Excel / CSV
 ↓
Docs
 ↓
table viewer
```

For Word documents:

```text
DOCX
 ↓
Docs
 ↓
document viewer
```

For Markdown:

```text
MD
 ↓
Code or Docs depending on context
```

---

# AGENT DOCUMENT READING

The agent should have tools such as:

```text
open_document
read_document
search_document
read_document_page
inspect_document_structure
```

The agent should be able to reason from documents.

Example:

```text
User:
Implement the API according to API-spec.pdf.
```

Agent:

```text
open_document("API-spec.pdf")
read relevant pages
extract requirements
implement code
test implementation
```

The document should not need to be manually opened by the user.

---

# DOCUMENT CONTEXT

Do not blindly load huge PDFs/documents into the model context.

Implement targeted retrieval.

For example:

```text
search:
"authentication endpoint"

→ pages 14-18

Agent reads relevant pages
```

This is important for large documentation.

---

# FILE TYPE ROUTING

Create a centralized file-type registry.

Conceptually:

```ts
type FileViewer =
  | "code"
  | "image"
  | "document"
  | "binary"
  | "unsupported";
```

Examples:

```text
.ts        → Code
.tsx       → Code
.py        → Code
.json      → Code
.md        → Code/Docs
.png       → Images
.jpg       → Images
.svg       → Images
.pdf       → Docs
.docx      → Docs
.xlsx      → Docs
.csv       → Docs
```

Do not scatter extension checks throughout the UI.

---

# AGENT WORKSPACE STATE

The editor should know what the agent is currently doing.

Example:

```ts
type AgentWorkspaceState = {
  activeSurface:
    | "code"
    | "browser"
    | "inspect"
    | "images"
    | "docs";

  activeFile?: string;

  activeBrowserService?: string;

  activeBrowserUrl?: string;

  activeInspectorPanel?:
    | "elements"
    | "console"
    | "network"
    | "performance"
    | "memory"
    | "application"
    | "security";

  status:
    | "idle"
    | "working"
    | "testing"
    | "waiting_for_user"
    | "debugging";
};
```

The UI should react to this state.

---

# AGENT ACTIVITY TIMELINE

Improve Project Chat so the user can understand what the agent is doing.

Example:

```text
AI Agent

✓ Inspected project
✓ Identified withgod-fe as frontend
✓ Updated Login.tsx
✓ Created ForgotPassword.tsx
✓ Started frontend
✓ Opened Browser
✓ Navigated to /login
✓ Running automated test
✓ Inspecting console
⚠ Found API error
→ Fixing backend endpoint
```

The user can expand each step.

Do not flood the chat with raw internal reasoning.

Show actions/results, not hidden chain-of-thought.

---

# AGENT TASK STATE

Long-running tasks should have explicit state.

Example:

```text
Task:
Implement forgot password

Status:
Testing

Progress:
████████████████░░░░ 80%

Current action:
Checking browser console
```

If waiting for user:

```text
Status:
Waiting for your input

Reason:
The application requires authentication.
```

---

# AGENT SHOULD AUTOMATICALLY IDENTIFY FRONTEND

The agent should be able to inspect the project and determine:

```text
frontend
backend
database
worker
mobile
admin
documentation
```

Use evidence such as:

```text
package.json
vite.config.*
next.config.*
angular.json
manage.py
pyproject.toml
docker-compose.*
README
directory structure
scripts
ports
framework signatures
```

Do not rely on folder names alone.

For example:

```text
withgod-fe
```

is a useful hint, but the system should confirm it.

---

# FRONTEND SERVICE DISCOVERY

Once the agent identifies the frontend:

```text
frontend project
 ↓
start command
 ↓
process
 ↓
port detection
 ↓
health check
 ↓
Browser
```

The Browser should automatically open the frontend.

Do not make the user manually enter:

```text
http://localhost:3001
```

---

# MULTIPLE FRONTENDS

Projects may contain:

```text
frontend
admin
storybook
docs
mobile-web
```

The agent should identify multiple browser-capable services.

Example:

```text
Browser

[Frontend]
[Admin]
[Storybook]
[Docs]
```

The agent chooses the relevant one based on the current task.

---

# AUTONOMOUS DEBUG LOOP

Implement a reusable agent workflow:

```text
IMPLEMENT
   ↓
BUILD
   ↓
START
   ↓
HEALTH CHECK
   ↓
OPEN BROWSER
   ↓
TEST
   ↓
FAIL?
 ┌─┴─┐
YES  NO
 │    │
 ▼    ▼
INSPECT  VERIFY
 │
 ▼
DIAGNOSE
 │
 ▼
FIX
 │
 └──────────────→ TEST AGAIN
```

Put sensible limits on retries.

For example:

```text
max automated fix/test iterations = configurable
```

Do not allow infinite loops.

---

# FAILURE ESCALATION

If the agent cannot resolve an issue automatically, it should explain:

```text
What I attempted
What failed
Evidence
What is required from the user
```

Example:

```text
I reached the login page successfully.

The next step requires a one-time authentication code.

I cannot obtain this code automatically.

Please enter the code to continue testing.
```

---

# PERMISSION MODEL

Create a centralized permission system.

Possible permission levels:

```text
read_project
write_project
execute_command
start_service
stop_service
browser_navigation
browser_interaction
external_network
read_sensitive_file
credential_input
destructive_action
deployment
```

Each tool declares the permissions it requires.

The system decides whether:

```text
auto-approved
ask user
denied
```

Do not make every action require confirmation.

Normal development actions should remain hands-off.

---

# EXAMPLE FULL EXPERIENCE

User:

```text
Add a forgot-password feature.
```

Agent:

```text
Inspecting project...
```

Then:

```text
Code tab opens.

Explorer:
withgod-fe
 └── src
      └── pages
           └── Login.tsx
```

Agent edits.

Then:

```text
Created:
ForgotPassword.tsx
```

Editor automatically opens:

```text
Code → ForgotPassword.tsx
```

Agent runs:

```text
yarn test
```

Then:

```text
✓ tests passed
```

Agent starts frontend.

Browser automatically opens:

```text
http://localhost:3001
```

Agent navigates:

```text
/login
```

Agent clicks:

```text
Forgot password
```

Agent fills:

```text
email
```

Agent submits.

Network request fails:

```text
POST /api/forgot-password
500
```

Agent automatically switches:

```text
Inspect → Network
```

Finds:

```text
500 Internal Server Error
```

Agent switches:

```text
Code
```

Opens backend endpoint.

Fixes code.

Restarts backend.

Returns to:

```text
Browser
```

Runs test again.

Then:

```text
POST /api/forgot-password
200
```

Test passes.

Agent reports:

```text
Forgot-password flow implemented and verified.

✓ Frontend updated
✓ Backend updated
✓ Tests passed
✓ Browser flow verified
✓ API request verified
```

This is the experience we want.

---

# CRITICAL — AGENT MUST ACTUALLY VERIFY

Never let the agent claim:

```text
Implemented successfully
```

merely because files were changed.

For UI features, whenever practical:

```text
code changed
→ app started
→ UI opened
→ behavior tested
```

For backend features:

```text
code changed
→ server started
→ endpoint tested
```

For frontend/backend integration:

```text
frontend
→ API
→ backend
→ database
```

should be tested where relevant.

---

# SCREENSHOT-BASED DEBUGGING

The agent should be able to use screenshots as evidence.

When a UI test fails:

```text
capture screenshot
→ open in Images
→ inspect
→ diagnose
```

Do not rely only on DOM text.

Visual verification is useful for:

```text
layout
modal
button visibility
overlap
responsive behavior
incorrect styling
broken rendering
```

---

# RESPONSIVE TESTING

The automation system should eventually support configurable viewport sizes.

Examples:

```text
Desktop
Tablet
Mobile
```

The agent can test:

```text
1280x720
1440x900
390x844
768x1024
```

Do not hardcode these as mandatory tests.

Allow the agent to choose relevant viewports.

---

# FILE EXPLORER ↔ AGENT SYNCHRONIZATION

When the agent opens a file:

```text
Explorer selects file
Code opens file
```

When user manually selects a file:

```text
Code opens file
```

When agent changes file:

```text
Explorer remains synchronized
```

When a file is deleted:

```text
Explorer updates
Code closes it if necessary
```

---

# BROWSER ↔ AGENT SYNCHRONIZATION

When agent navigates:

```text
Browser URL updates
```

When user navigates manually:

```text
Agent should be able to observe current browser state
```

When a page crashes:

```text
Agent receives browser error state
```

---

# INSPECT ↔ AGENT SYNCHRONIZATION

When agent asks:

```text
inspect_console
```

Inspect tab may automatically activate.

When agent asks:

```text
inspect_network
```

Network panel activates.

When agent inspects an element:

```text
Elements panel activates
element highlighted
```

---

# SECURITY REQUIREMENTS

Because the agent can now:

* execute code
* navigate websites
* read files
* modify files
* inspect browser state
* access network data

security is critical.

Implement isolation between:

```text
user
project
container
browser session
agent
```

Do not expose:

```text
host filesystem
Docker socket
other users' projects
other browser sessions
environment secrets
API keys
passwords
cookies
```

to the model unless explicitly required.

Use least privilege.

---

# SECRET HANDLING

Credentials should be represented to the agent as:

```text
credential_available = true
```

rather than:

```text
password = "actual-password"
```

whenever possible.

Do not put passwords into:

```text
chat history
logs
agent transcript
tool output
screenshots
analytics
```

unless explicitly required and securely handled.

---

# DOCKER ARCHITECTURE

The entire system must continue working in Docker.

Do not assume:

```text
Mac
Linux
Windows
```

specific host paths.

Do not hardcode:

```text
/Users/username
```

or similar paths.

The architecture must work for other users.

---

# NO PROJECT-SPECIFIC LOGIC

Do not create:

```text
if project === "withgod"
```

or:

```text
if folder === "withgod-fe"
```

or:

```text
if port === 3001
```

for core functionality.

The system must work with arbitrary projects.

---

# TOOL RESULT CONTRACTS

Every agent tool must return structured data.

Example:

```ts
type AgentToolResult<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  artifacts?: Artifact[];
};
```

Never return:

```text
undefined
null
empty string
```

for an execution that actually happened.

---

# EVENT ARCHITECTURE

Create a unified event system for agent activity.

Examples:

```text
agent.task.started
agent.task.progress
agent.file.created
agent.file.updated
agent.file.opened
agent.command.started
agent.command.output
agent.command.completed
agent.service.started
agent.service.ready
agent.service.stopped
agent.browser.opened
agent.browser.navigated
agent.browser.action
agent.browser.test.started
agent.browser.test.completed
agent.inspector.updated
agent.permission.requested
agent.permission.granted
agent.permission.denied
agent.document.opened
agent.image.opened
agent.task.completed
agent.task.failed
```

The UI should subscribe to these events.

This is preferable to tightly coupling the agent to individual React components.

---

# ARTIFACT SYSTEM

Create a generic artifact model.

Artifacts can include:

```text
file
screenshot
trace
video
console log
network log
test result
document
image
```

Example:

```ts
type AgentArtifact = {
  id: string;
  taskId: string;
  type:
    | "file"
    | "image"
    | "document"
    | "screenshot"
    | "trace"
    | "console"
    | "network"
    | "test-result";
  path?: string;
  metadata?: Record<string, unknown>;
};
```

This allows the UI to open artifacts in the correct module.

---

# TESTING REQUIREMENTS

Implement automated tests for the new architecture.

At minimum test:

## Agent navigation

* create file
* open file
* modify file
* select file in explorer
* automatically activate Code

## Browser

* start frontend
* detect port
* open Browser
* navigate
* click
* type
* inspect DOM

## Inspect

* console
* network
* elements
* performance
* application where supported

## Permissions

* pause
* request credentials
* resume
* cancel

## Images

* open PNG
* open JPG
* open SVG
* screenshot artifact

## Documents

* open PDF
* read PDF
* open DOCX
* open XLSX
* open CSV

## Autonomous loop

```text
modify
→ run
→ test
→ fail
→ inspect
→ fix
→ retest
→ pass
```

---

# ACCEPTANCE CRITERIA

The implementation is complete when:

* [ ] Agent can control workspace navigation.
* [ ] Agent can create files.
* [ ] Agent can update files.
* [ ] Created files automatically appear in Explorer.
* [ ] Edited files automatically open in Code.
* [ ] Code tab automatically activates when coding.
* [ ] Browser automatically activates when testing UI.
* [ ] Agent can identify frontend services.
* [ ] Agent can identify backend services.
* [ ] Agent can start services.
* [ ] Agent can discover ports.
* [ ] Agent can open the correct frontend automatically.
* [ ] Agent can navigate websites.
* [ ] Agent can click elements.
* [ ] Agent can type into inputs.
* [ ] Agent can inspect DOM.
* [ ] Agent can perform automated UI tests.
* [ ] Agent can capture screenshots.
* [ ] Agent can inspect console.
* [ ] Agent can inspect network.
* [ ] Agent can inspect performance where supported.
* [ ] Agent can inspect memory where supported.
* [ ] Agent can inspect application storage where supported.
* [ ] Agent can inspect security information where supported.
* [ ] Inspect is synchronized with the active Browser session.
* [ ] Agent can pause for user input.
* [ ] User can provide credentials without exposing them unnecessarily to the model.
* [ ] Agent can resume after permission/input.
* [ ] Agent can autonomously debug failures.
* [ ] Agent can iterate through implementation → test → debug.
* [ ] Images have a dedicated workspace tab.
* [ ] Documents have a dedicated workspace tab.
* [ ] Agent can automatically open images.
* [ ] Agent can automatically open documents.
* [ ] Agent can read relevant portions of documents.
* [ ] Large documents are retrieved selectively rather than blindly loaded.
* [ ] Browser screenshots can open in Images.
* [ ] Test artifacts can be inspected.
* [ ] Workspace state is synchronized with agent activity.
* [ ] Agent activity is visible without exposing hidden chain-of-thought.
* [ ] User permissions are centralized.
* [ ] Security boundaries are enforced.
* [ ] Project/user isolation is maintained.
* [ ] No project-specific hardcoding is introduced.
* [ ] Existing editor functionality continues to work.
* [ ] Docker deployment remains functional.

---

# IMPLEMENTATION STRATEGY

Do NOT attempt to blindly rewrite the entire application.

First inspect the existing architecture.

Then divide implementation into logical layers:

```text
Layer 1
Agent orchestration

Layer 2
Agent tools

Layer 3
Workspace event/state system

Layer 4
Process/service management

Layer 5
Browser automation

Layer 6
Browser inspection

Layer 7
Permission system

Layer 8
Artifact system

Layer 9
Images viewer

Layer 10
Documents viewer

Layer 11
Frontend UI integration

Layer 12
Docker/security isolation
```

Reuse existing functionality wherever possible.

---

# IMPORTANT: KEEP THE USER EXPERIENCE SIMPLE

Although the underlying system is complex, the UI should remain simple.

The user should mostly see:

```text
AI is working...

✓ Implemented feature
✓ Started application
✓ Opened browser
✓ Testing login
✓ Found API error
✓ Fixed backend
✓ Retesting
✓ Verification passed
```

The complexity should live underneath.

---

# FINAL EXECUTION REQUIREMENT

Do not stop after designing the architecture.

Inspect the repository and implement the system incrementally.

For each major subsystem:

1. Inspect existing implementation.
2. Identify reusable components.
3. Implement the missing architecture.
4. Integrate with the agent.
5. Add tests.
6. Run tests.
7. Fix failures.
8. Verify end-to-end.

Start with the highest-value foundation:

```text
1. Workspace control/event system
2. Agent-controlled navigation
3. Browser automation
4. Inspect integration
5. Permission/pause/resume
6. Image viewer
7. Document viewer
8. Artifact system
9. Autonomous test/debug loop
```

Do not merely create visual tabs.

Every tab and capability must be connected to real agent tools and real runtime data.

The final result should allow a user to give a high-level request such as:

> "Add a forgot-password feature and make sure it works."

and the AI Native Editor should be capable of:

```text
inspect project
→ edit files
→ navigate code
→ run application
→ detect frontend
→ open browser
→ interact with UI
→ test feature
→ inspect errors
→ debug
→ modify code
→ retest
→ request user input only when necessary
→ verify
→ present final result
```

The user should not have to manually drive the IDE during this workflow.

````

### One architectural point I would make especially clear to Opus

What you're describing is **not just "add an Inspect tab."** You are building an **agent-controlled workspace**.

The important architecture is:

```text
                         AI AGENT
                            │
             ┌──────────────┼───────────────┐
             │              │               │
             ▼              ▼               ▼
        File Tools     Browser Tools    Process Tools
             │              │               │
             ▼              ▼               ▼
          CODE          BROWSER          SERVICES
             │              │               │
             │              ▼               │
             │          INSPECT             │
             │       ┌────────────┐         │
             │       │ Elements   │         │
             │       │ Console    │         │
             │       │ Network    │         │
             │       │ Performance│         │
             │       │ Memory     │         │
             │       │ Application│         │
             │       │ Security   │         │
             │       └────────────┘         │
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
                    WORKSPACE EVENTS
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
          Code           Browser          Images/Docs
````

And then the really important part is the **pause/resume human interaction**:

```text
             AI Agent
                │
                ▼
          Browser Test
                │
                ▼
       Login credentials needed
                │
                ▼
      ┌───────────────────────┐
      │ WAITING FOR USER      │
      │                       │
      │ Username: [          ]│
      │ Password: [          ]│
      │                       │
      │      [Continue]       │
      └───────────┬───────────┘
                  │
             User responds
                  │
                  ▼
             Agent resumes
                  │
                  ▼
          Continue test
                  │
                  ▼
              Verify
```

That will give you the **hands-off experience** you're describing without making the agent blindly autonomous around sensitive actions.

Also, I would **not expose the model's chain-of-thought** in the UI. Show the agent's **actions, tool calls, results, tests, errors, and progress** instead. That gives the user the same transparency they need without turning internal reasoning into a product feature.
