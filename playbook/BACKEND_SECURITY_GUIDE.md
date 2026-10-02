# 🛡️ Backend Security Guide

This guide defines the standards and workflows for performing security audits of backend services. It provides the patterns needed to trigger the `backend-vulnerability-check` skill and ensure server-side integrity.

## 🚀 How to Invoke

The Planner Agent maps natural language requests to the backend security skill. Use the following keywords to trigger a vulnerability check:

| Goal Keyword | Tool/Skill Triggered | Expected Outcome |
| :--- | :--- | :--- |
| **"Run backend security scan"** | `backend-vulnerability-check` | A comprehensive scan of API and Service layers for server-side risks. |
| **"Audit backend"** | `backend-vulnerability-check` | A deep dive into access control, data exposure, and server integrity. |
| **"Check for SQLi/SSRF"** | `backend-vulnerability-check` | Targeted search for injection and request forgery vulnerabilities. |
| **"Backend Security Audit"** | `backend-vulnerability-check` | Full audit of Django settings, serializers, and models. |

## 📝 Example Prompts

### Targeted Scan
> "Run a security scan on the User and Payment API endpoints. Focus specifically on Broken Access Control and Data Exposure in serializers."

### Comprehensive Audit
> "Audit the entire backend for vulnerabilities, including a review of `settings.py` for insecure defaults."

## 🛠️ Master Backend Security Workflow Template

For a production-ready backend audit, use the following prompt. This directs the agent to follow a professional server-side security lifecycle:

**Prompt:**
> "Perform a comprehensive backend security audit of the current project. 
> 
> 1. **Scan**: Execute the `backend-vulnerability-check` skill across the API, Serializer, and Service/Selector layers.
> 2. **Report**: Create a `BACKEND_SECURITY_REPORT.md` in the workspace root containing all findings categorized by severity (Critical, High, Medium, Low).
> 3. **Remediate**: For all 'Critical' and 'High' severity findings, propose a targeted code patch.
> 4. **Verify**: Ensure the fixes maintain existing API contracts and do not introduce new regressions in business logic.
> 
> Please start by mapping the API surface and listing the high-risk components you will be auditing."

## 🛡️ Backend Security Standards
When auditing, the agent adheres to the following standards:
- **Principle of Least Privilege**: Ensure that users and services have only the minimum access necessary.
- **Secure by Default**: Recommend configurations that are secure out-of-the-box.
- **Validate at the Service Boundary**: All input must be validated at the entry point of the Service layer, regardless of previous checks in the API view.
- **Zero Trust Internals**: Do not trust data moving between internal layers; validate and sanitize at every boundary.
