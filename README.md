# EDI Pipeline Navigator

Internal tool for DSV EDI development on Sterling & Lightwell — clarifies roles/steps
(Procedure Orchestrator) and organizes QA documents/directories (Artifact Manager).

## Stack
- **Frontend:** React 18 + Vite + TypeScript + Ant Design v5 (theme-switchable)
- **Backend:** Spring Boot 3 (Java 17) + Spring Security (JWT) + Spring Data JPA + H2 (file mode)

## Prerequisites
- Java 17 — `C:\Users\ANGUTANG\jdk-17.0.19+10`
- Node — `C:\Users\ANGUTANG\node-v24.14.1-win-x64`
- Maven — `C:\Users\ANGUTANG\Downloads\apache-maven-3.8.4`

## Run (development)

### One command (recommended)
Starts backend + frontend together, auto-picks free ports if the defaults are taken,
and injects the resolved backend port into the frontend proxy:
```powershell
.\start-dev.cmd            # or: powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```
Options: `-BackendPort 8080 -FrontendPort 5173 -StopExisting`
(paths overridable via `-JavaHome`, `-NodeHome`, `-MavenBin`).

Shut everything down:
```powershell
.\stop-dev.ps1
```

### Manual (two terminals)
```powershell
$env:JAVA_HOME="C:\Users\ANGUTANG\jdk-17.0.19+10"
cd backend
mvn.cmd spring-boot:run
```

Frontend (port 5173, proxies `/api` to 8080):
```powershell
$env:Path="C:\Users\ANGUTANG\node-v24.14.1-win-x64;$env:Path"
cd frontend
npm.cmd install   # first time only
npm.cmd run dev
```

Open http://localhost:5173

## Default admin
Seeded on first backend start (override via env vars `EDINAV_ADMIN_USER` / `EDINAV_ADMIN_PASSWORD`):
- username: `admin`
- password: `admin123`

New sign-ups via the Register page are created as `USER`.

## Useful endpoints
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- H2 console: http://localhost:8080/h2-console (JDBC URL `jdbc:h2:file:./data/edinav`, user `sa`)

## Configuration
See `backend/src/main/resources/application.yml`. In production, set `EDINAV_JWT_SECRET`.

## Roadmap
- **M1 — Foundation + Auth** ✅ (JWT auth, roles, theming, app shell)
- **M2 — Procedure Orchestrator** ✅ (global workflow tree, sub-steps, business roles,
  branching transitions with condition labels, admin CRUD, role-filtered view)
- **M3 — Artifact Manager** ✅ (per-user artifacts from directory templates, folder tree,
  uploads/downloads, ZIP export, status stepper + history linked to workflow steps)

## Sub-Workflow JSON import

Admins can bulk-create a single sub-workflow (container + step tree + branching) from a JSON
document via **Sub-Workflows → Import JSON** (upload a file or paste the text), which posts to
`POST /api/workflow/workflows/import`.

Because step database ids do not exist yet at import time, steps carry a caller-defined `ref`
key. Transitions and `entryStepRef` reference steps by that `ref`; the backend resolves each
`ref` to the generated id. Parent/child nesting is expressed with `children`. Business roles are
referenced by **name** and auto-created when they don't already exist. The whole import runs in
one transaction — any error rolls it all back. Only `SUB` workflows are supported (importing a
`MASTER` composition is not yet available).

### Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `name` | ✅ | Workflow name, must be unique (else 409) |
| `description` | | Free text |
| `type` | | `SUB` (default). `MASTER` is rejected for now |
| `status` | | `DRAFT` (default) or `PUBLISHED` |
| `entryStepRef` | | A step `ref` to mark as the entry step |
| `steps[]` | ✅ | Step tree; nest with `children` |
| `steps[].ref` | ✅ | Unique key within the file (used by transitions/entry) |
| `steps[].name` | ✅ | Step name |
| `steps[].description` / `notes` | | Free text |
| `steps[].role` | | Business role name (resolved by name, auto-created) |
| `steps[].children[]` | | Nested child steps (same shape) |
| `transitions[]` | | Branching edges; `from`/`to` are step `ref`s, `label` is the condition |

### Template

```jsonc
{
  "name": "JP-MBL Import Parsing",
  "description": "Reusable sub-workflow for parsing JP MBL import files",
  "type": "SUB",                 // "SUB" | "MASTER" (defaults to SUB)
  "status": "DRAFT",             // "DRAFT" | "PUBLISHED" (defaults to DRAFT)
  "entryStepRef": "receive",     // a step ref, marks the entry step (optional)
  "steps": [
    {
      "ref": "receive",          // unique key within this file
      "name": "Receive EDI file",
      "description": "Pick up inbound EDI from the LW mailbox",
      "notes": "Runs every 5 min",
      "role": "EDI Developer",   // resolved by name, created if missing
      "children": [
        { "ref": "validate", "name": "Validate envelope", "role": "QA" }
      ]
    },
    { "ref": "parse",  "name": "Parse segments",  "role": "EDI Developer" },
    { "ref": "reject", "name": "Reject & notify", "role": "QA" }
  ],
  "transitions": [
    { "from": "validate", "to": "parse",  "label": "On valid" },
    { "from": "validate", "to": "reject", "label": "On error" }
  ]
}
```
