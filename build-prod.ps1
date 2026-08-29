param(
  [switch]$SkipFrontend = $false,
  [string]$JavaHome = "",
  [string]$NodeHome = "",
  [string]$MavenBin = ""
)

# Builds the production artifacts for the single-port "prod" flow:
#   1) builds the React frontend  -> frontend/dist
#   2) packages the Spring Boot fat jar -> backend/target/*.jar
# Run this after changing frontend or backend code. The dev flow (start-dev.cmd)
# is unaffected — this only produces the artifacts that start-prod.cmd runs.

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptRoot 'backend'
$frontendDir = Join-Path $scriptRoot 'frontend'

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

# Load .env so tool paths are configurable per machine (same convention as start-dev).
$envFile = Join-Path $scriptRoot '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $key = $matches[1].Trim()
      $value = $matches[2].Trim()
      [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
  }
  Write-Host "[env] Loaded .env file"
}

# Resolve JAVA_HOME: -JavaHome override -> JAVA_HOME env/.env -> derived from java on PATH.
if (-not $JavaHome) {
  if ($env:JAVA_HOME) {
    $JavaHome = $env:JAVA_HOME
  } else {
    $javaOnPath = (Get-Command java.exe -ErrorAction SilentlyContinue).Source
    if ($javaOnPath) { $JavaHome = Split-Path -Parent (Split-Path -Parent $javaOnPath) }
  }
}
if (-not $JavaHome) { throw "Java not found. Add java to PATH, set JAVA_HOME in .env, or pass -JavaHome <path>." }
if (-not (Test-Path $JavaHome)) { throw "JAVA_HOME not found: $JavaHome. Fix JAVA_HOME in .env or pass -JavaHome <path>." }
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"

# Resolve Node home: -NodeHome override -> NODE_HOME env/.env -> derived from node on PATH.
if (-not $NodeHome) {
  if ($env:NODE_HOME) {
    $NodeHome = $env:NODE_HOME
  } else {
    $nodeOnPath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if ($nodeOnPath) { $NodeHome = Split-Path -Parent $nodeOnPath }
  }
}

# Resolve the Maven launcher: -MavenBin override -> MAVEN_BIN env/.env -> mvn.cmd on PATH.
if (-not $MavenBin) {
  if ($env:MAVEN_BIN) {
    $MavenBin = $env:MAVEN_BIN
  } else {
    $mvnOnPath = (Get-Command mvn.cmd -ErrorAction SilentlyContinue).Source
    if ($mvnOnPath) { $MavenBin = $mvnOnPath }
  }
}
if (-not $MavenBin) { throw "Maven not found. Add mvn to PATH, set MAVEN_BIN in .env, or pass -MavenBin <path-to-mvn.cmd>." }
if (-not (Test-Path $MavenBin)) { throw "Maven not found at '$MavenBin'. Fix MAVEN_BIN in .env or pass -MavenBin <path-to-mvn.cmd>." }

if (-not $SkipFrontend) {
  Write-Host "Building frontend..."
  Push-Location $frontendDir
  try {
    if ($NodeHome) {
      if (-not (Test-Path $NodeHome)) { throw "Node home not found: $NodeHome. Fix NODE_HOME in .env or pass -NodeHome <path>." }
      $env:Path = "$NodeHome;$env:Path"
      $npmCmd = Join-Path $NodeHome 'npm.cmd'
    } else {
      $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
      if (-not $npmCmd) { throw "npm not found. Add node to PATH, set NODE_HOME in .env, or pass -NodeHome <path>." }
    }
    if (-not (Test-Path 'node_modules')) { & $npmCmd install; if ($LASTEXITCODE -ne 0) { throw "npm install failed" } }
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping frontend build (-SkipFrontend)."
}

Write-Host "Packaging backend fat jar..."
Push-Location $backendDir
try {
  & $MavenBin -q -DskipTests clean package
  if ($LASTEXITCODE -ne 0) { throw "Backend package failed" }
} finally {
  Pop-Location
}

$jar = Get-ChildItem (Join-Path $backendDir 'target') -Filter 'edi-pipeline-navigator-*.jar' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike '*.original' } |
  Select-Object -First 1
if (-not $jar) { throw "Jar not found under backend/target" }

Write-Host ""
Write-Host "==============================================="
Write-Host " Production artifacts ready"
Write-Host "   Jar     : $($jar.FullName)"
Write-Host "   Frontend: $(Join-Path $frontendDir 'dist')"
Write-Host " Launch with start-prod.cmd"
Write-Host "==============================================="
