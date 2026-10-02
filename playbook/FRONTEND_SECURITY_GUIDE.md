# 🛡️ Frontend Security Guide

This guide defines the standards and workflows for performing security audits of frontend applications. It provides the patterns needed to trigger the `frontend-vulnerability-check` skill and ensure high-quality security outcomes.

## 🚀 How to Invoke

The Planner Agent maps natural language requests to the security audit skill. Use the following keywords to trigger a vulnerability check:

| Goal Keyword | Tool/Skill Triggered | Expected Outcome |
| :--- | :--- | :--- |
| **"Run security scan"** | `frontend-vulnerability-check` | A comprehensive scan of the target area for common web vulnerabilities. |
| **"Audit frontend"** | `frontend-vulnerability-check` | A deep dive into the security posture of the frontend application. |
| **"Check for XSS"** | `frontend-vulnerability-check` | Targeted search for Cross-Site Scripting vulnerabilities. |
| **"Security Audit"** | `frontend-vulnerability-check` | Full audit including dependencies, storage, and API interaction. |

## 📝 Example Prompts

### Targeted Scan
> "Run a security scan on the login and registration pages. Focus specifically on XSS and insecure token storage."

### Comprehensive Audit
> "Audit the entire frontend for vulnerabilities. I want a full report including dependency checks and API security analysis."

## 🛠️ Master Security Workflow Template

For a production-ready security audit, use the following prompt. This directs the agent to follow a professional audit lifecycle:

**Prompt:**
> "Perform a comprehensive frontend security audit of the current project. 
> 
> 1. **Scan**: Execute the `frontend-vulnerability-check` skill across the entire frontend directory.
> 2. **Report**: Create a `SECURITY_AUDIT_REPORT.md` in the workspace root containing all findings categorized by severity (Critical, High, Medium, Low).
> 3. **Remediate**: For all 'Critical' and 'High' severity findings, propose a targeted code patch.
> 4. **Verify**: Double-check that the proposed fixes do not introduce regressions in the UI or break existing functionality.
> 
> Please start by mapping the attack surface and listing the components you will be auditing."

## 🛡️ Security Standards
When auditing, the agent adheres to the following standards:
- **Zero-Trust Frontend**: Assume all client-side data is untrusted.
- **Defense in Depth**: Recommend multiple layers of protection (e.g., both input validation and CSP).
- **Practical Risk**: Prioritize findings that are actually exploitable over theoretical risks.
