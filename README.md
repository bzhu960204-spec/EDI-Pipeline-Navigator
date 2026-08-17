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

## Tests
Backend tests use JUnit 5 + Spring Boot Test on a throwaway in-memory H2 database, so they
never touch the dev file DB (`./data/edinav`).

```powershell
$env:JAVA_HOME="C:\Users\ANGUTANG\jdk-17.0.19+10"
cd backend
mvn.cmd test                          # all tests
mvn.cmd "-Dtest=WorkflowServiceTest" test   # just the workflow safety net
```

- `WorkflowServiceTest` (`@DataJpaTest` + real H2) — the workflow import/export/versioning safety net:
  duplicate-name rejection, import→export round-trip, tree nesting (roles/phase/transitions),
  `createVersion` deep copy, `setCurrent` flag move, and update-from-import step-id preservation.
- `ApplicationContextTest` (`@SpringBootTest`) — boots the full context to catch missing or
  circular beans across the split workflow services/controllers.

Frontend has no unit tests yet; type-check with `npm.cmd run build` (`tsc --noEmit && vite build`).

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
key. Transitions and `steps[].phase` reference steps/phases by that `ref`; the
backend resolves each `ref` to the generated id. Parent/child nesting is expressed with `children`.
Business roles are referenced by **name** and auto-created when they don't already exist. Phases
are declared once under `phases[]` and attached to steps via `steps[].phase`. The whole import runs
in one transaction — any error rolls it all back.

The same schema is produced by **Export** (`GET /api/workflow/workflows/{id}/export`), so an
exported file re-imports cleanly. Unknown fields are ignored, so older exports still import.

### Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `name` | ✅ | Workflow name, must be unique (else 409) |
| `description` | | Free text |
| `status` | | `DRAFT` (default) or `PUBLISHED` |
| `phases[]` | | Phase definitions (swimlanes); referenced by steps via `phase` |
| `phases[].ref` | ✅ (if used) | Unique key within the file (used by `steps[].phase`) |
| `phases[].name` | ✅ (if used) | Phase name |
| `phases[].color` | | Hex color for the swimlane band (e.g. `#1677ff`) |
| `phases[].orderIndex` | | Sort order among phases |
| `phases[].description` | | Free text |
| `steps[]` | ✅ | Step tree; nest with `children` |
| `steps[].ref` | ✅ | Unique key within the file (used by transitions) |
| `steps[].name` | ✅ | Step name |
| `steps[].description` / `notes` | | Free text |
| `steps[].roles` | | Business role names (array; resolved by name, auto-created). A step may have several. |
| `steps[].role` | | Legacy single role name; still accepted and merged with `roles` |
| `steps[].phase` | | A phase `ref` this step belongs to |
| `steps[].lineageKey` | | Cross-version identity (UUID); emitted by Export, auto-generated if omitted |
| `steps[].children[]` | | Nested child steps (same shape) |
| `transitions[]` | | Branching edges; `from`/`to` are step `ref`s, `label` is the condition |
| `transitions[].label` | | Condition/branch text. Edges from the **same** `from` sharing a `label` start **together** (parallel AND fan-out); a different `label` is an alternative branch (decision / OR) |
| `transitions[].coFireGroup` | | Tag shared by 2+ edges that all point to the **same** target; they must all fire before that target starts (AND join) |

### Template

```jsonc
{
  "name": "JP-MBL Import Parsing",
  "description": "Reusable sub-workflow for parsing JP MBL import files",
  "status": "DRAFT",             // "DRAFT" | "PUBLISHED" (defaults to DRAFT)
  "steps": [
    {
      "ref": "receive",          // unique key within this file
      "name": "Receive EDI file",
      "description": "Pick up inbound EDI from the LW mailbox",
      "notes": "Runs every 5 min",
      "roles": ["EDI Developer", "QA"],  // names, resolved/created; a step may have several
      "children": [
        {
          "ref": "validate",
          "name": "Validate envelope",
          "description": "Verify ISA/GS headers and envelope control numbers",
          "notes": "Fails fast if envelope control number is duplicated",
          "roles": ["QA"]
        }
      ]
    },
    {
      "ref": "parse",
      "name": "Parse segments",
      "description": "Extract transaction set body and parse mandatory EDI segments into staging tables",
      "notes": "Requires ITX Type Tree mapping v2.1",
      "roles": ["EDI Developer"]
    },
    {
      "ref": "reject",
      "name": "Reject & notify",
      "description": "Generate rejection acknowledgment and dispatch email alerts",
      "notes": "Sends alert to EDI Operations mailing list",
      "roles": ["QA"]
    },
    {
      "ref": "enrich",
      "name": "Enrich data",
      "description": "Lookup master data (UN/LOCODE, partner IDs) to supplement parsing results",
      "notes": "Connects to Master Data API via HTTPS",
      "roles": ["EDI Developer"]
    },
    {
      "ref": "archive",
      "name": "Archive",
      "description": "Move processed raw file and parsed payload to long-term storage",
      "notes": "Retention period set to 30 days",
      "roles": ["EDI Developer", "QA"]
    }
  ],
  "transitions": [
    // json format加入了一些新的特性，一个条件可以开启多步，coFire的意思是多个步骤一起才能进入另一步，你可以使用这些新特性
    // one condition opens several steps: "On valid" starts parse AND enrich together (parallel)
    { "from": "validate", "to": "parse",  "label": "On valid" },
    { "from": "validate", "to": "enrich", "label": "On valid" },
    // a different label on the same "from" is an alternative branch (decision / OR)
    { "from": "validate", "to": "reject", "label": "On error" },
    // co-fire join: "archive" starts only after BOTH parse and enrich have fired
    { "from": "parse",  "to": "archive", "coFireGroup": "ready" },
    { "from": "enrich", "to": "archive", "coFireGroup": "ready" }
  ]
}
```

## Directory Template JSON import/export

Admins can create, replace and download directory (QA folder) templates as JSON on the
**Directory Templates** page:

- **Import** (list header) creates a new template from JSON via `POST /api/templates/import`.
  The template is never set as default on import, even if the file says so.
- **Export** (edit header) downloads the selected template via `GET /api/templates/{id}/export`;
  the file re-imports cleanly.
- **Update from JSON** (edit header) replaces the selected template's metadata and entire folder
  tree via `PUT /api/templates/{id}/import`.

A template is a pure folder tree, so the JSON carries no database ids — nesting is expressed with
`children`. The whole import runs in one transaction; any error rolls it all back. Unknown fields
are ignored, so older exports still import.

### Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `name` | ✅ | Template name, must be unique (else 409) |
| `description` | | Free text |
| `isDefault` | | Kept by Export; **ignored on Import** (new templates never steal the default); honored by Update from JSON |
| `nodes[]` | | Root folders |
| `nodes[].name` | ✅ | Folder name |
| `nodes[].description` | | What the folder is used for |
| `nodes[].children[]` | | Nested subfolders (same shape) |

### Template

```jsonc
{
  "name": "DSV EDI Standard",
  "description": "Default QA folder structure based on a standard EDIT project.",
  "isDefault": true,            // kept by Export, ignored on Import
  "nodes": [
    {
      "name": "RT",
      "description": "Runtime artifacts",
      "children": [
        { "name": "LW", "children": [] },
        { "name": "SI", "children": [] }
      ]
    },
    {
      "name": "TEST",
      "children": [
        { "name": "UNIT", "children": [] }
      ]
    },
    { "name": "BP",      "children": [] },
    { "name": "DESIGN",  "children": [] },
    { "name": "EISP",    "children": [] },
    { "name": "QA Docs", "children": [] },
    { "name": "SPEC",    "children": [] },
    { "name": "SQL",     "children": [] }
  ]
}
```
