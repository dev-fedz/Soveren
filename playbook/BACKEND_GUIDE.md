# ⚙️ Backend Agent: Professional Django Architecture Guide

This guide provides the architectural standards and the "Master Build" template to ensure your backend is scalable, maintainable, and follows the professional patterns used in `safeairhris`.

## 🏛️ The Architectural Standard (HackSoftware Style)
The core philosophy is **Strict Decoupling**. Business logic must never leak into the interface layer.

### 1. The Layered Approach
| Layer | Responsibility | Rule |
| :--- | :--- | :--- |
| **API/Views** | Request handling & response formatting. | **Thin.** Only calls selectors and services. |
| **Serializers** | Data validation and transformation. | **Thin.** Use separate Input and Output serializers. |
| **Services** | Writing/Modifying data (The "Doers"). | **Pure Logic.** Handles DB writes and business rules. |
| **Selectors** | Fetching/Filtering data (The "Getters"). | **Pure Logic.** Handles complex DB queries. |
| **Models** | Data definition and basic properties. | **Thin.** No business logic in `save()` or Managers. |

### 2. Naming Conventions
- **Services**: `<entity>_<action>` (e.g., `user_create`, `order_cancel`).
- **APIs**: `<Entity><Action>Api` (e.g., `UserCreateApi`).
- **Infrastructure**:
    - Redis for caching and as a Celery broker.
    - Celery/Beat for asynchronous tasks and scheduled jobs.
    - MQTT for hardware/device integration.

---

## 🌟 The "Master Backend Build" Template

When starting a new backend project, copy and paste this prompt into the chat. It forces the agent to act as a Senior Software Architect and avoid "lazy" AI patterns.

**Copy and paste this template, filling in the brackets:**

> **"Start a new Django backend project. First, ask me for:
> 1. Project Name and Core Business Domain.
> 2. Required Infrastructure (e.g., Redis, Celery, Celery Beat, MQTT, PostgreSQL).
> 3. Key Entities and their relationships (e.g., User, Organization, Device).
> 4. Authentication Strategy (e.g., Knox, JWT, OAuth2).
> 5. Integration Requirements (e.g., Hardware drivers, 3rd party APIs).
> 
> Once confirmed, execute the following professional workflow:
> - **Architecture Setup**: Initialize the project with a `framework` layer containing custom pagination, base permissions, and global exception handlers.
> - **Service/Selector Layer**: For every feature, implement a separate `services.py` for writes and `selectors.py` for reads. Ensure no business logic resides in views or models.
> - **API Development**: Create thin API views using separate Input and Output serializers.
> - **Async Pipeline**: Configure Celery and Redis for background tasks. If needed, set la Celery Beat for scheduled jobs.
> - **Hardware Layer**: If MQTT/Devices are required, implement a driver-based registry pattern.
> - **Infrastructure**: Provide the `Dockerfile` and `docker-compose.yml` including the DB, Redis, and Celery worker/beat containers.
> - **Validation**: Run the `validate_architecture_standards` tool on all created files to ensure zero 'fat views' or 'fat models'.
> - **Final Deliverable**: Save all files to the workspace and provide a detailed architectural map."**

### 🏁 Summary of Professional Workflow
`Requirements` $\rightarrow$ `Infra Setup` $\rightarrow$ `Framework Layer` $\rightarrow$ `Service/Selector Logic` $\rightarrow$ `API Implementation` $\rightarrow$ `Async/MQTT Config` $\rightarrow$ `Architecture Audit` $\rightarrow$ `Containerization`
