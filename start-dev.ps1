param(
  [int]$BackendPort = 8080,
  [int]$FrontendPort = 5173,
  [switch]$StopExisting = $false,
  [string]$JavaHome = "C:\Users\ANGUTANG\jdk-17.0.19+10",
  [string]$NodeHome = "C:\Users\ANGUTANG\node-v24.14.1-win-x64",
  [string]$MavenBin = ""
)

$ErrorActionPreference = 'Stop'

function Stop-ListeningProcessByPort {
  param([int]$Port)
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) { Write-Host "No listening process on port $Port"; return }
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    try { Stop-Process -Id $processId -Force -ErrorAction Stop; Write-Host "Stopped process $processId on port $Port" }
    catch { Write-Host "Failed to stop process $processId on port ${Port}: $($_.Exception.Message)" }
  }
}

function Test-PortFree {
  param([int]$Port)
  # A port is only free if nothing is listening AND nothing can bind to it.
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $false }
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Get-FreePort {
  param([int]$StartPort, [int[]]$ReservedPorts = @(), [int]$MaxTries = 50)
  for ($i = 0; $i -lt $MaxTries; $i++) {
    $candidate = $StartPort + $i
    if ($ReservedPorts -contains $candidate) { continue }
    if (Test-PortFree -Port $candidate) { return $candidate }
  }
  throw "No free port found in range $StartPort..$($StartPort + $MaxTries - 1)"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptRoot 'backend'
$frontendDir = Join-Path $scriptRoot 'frontend'

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

# Resolve the Maven launcher: caller override -> PATH -> known install location.
if (-not $MavenBin) {
  $mvnOnPath = (Get-Command mvn.cmd -ErrorAction SilentlyContinue).Source
  if ($mvnOnPath) { $MavenBin = $mvnOnPath }
  else { $MavenBin = "C:\Users\ANGUTANG\Downloads\apache-maven-3.8.4\bin\mvn.cmd" }
}
if (-not (Test-Path $MavenBin)) { throw "Maven not found at '$MavenBin'. Pass -MavenBin <path-to-mvn.cmd>." }
if (-not (Test-Path $JavaHome)) { throw "JAVA_HOME not found: $JavaHome. Pass -JavaHome <path>." }
if (-not (Test-Path $NodeHome)) { throw "Node home not found: $NodeHome. Pass -NodeHome <path>." }

if ($StopExisting) {
  Stop-ListeningProcessByPort -Port $BackendPort
  Stop-ListeningProcessByPort -Port $FrontendPort
}

# Resolve free ports BEFORE starting anything, so children get the right values.
$requestedBackendPort = $BackendPort
$requestedFrontendPort = $FrontendPort
$BackendPort = Get-FreePort -StartPort $BackendPort
$FrontendPort = Get-FreePort -StartPort $FrontendPort -ReservedPorts @($BackendPort)

if ($BackendPort -ne $requestedBackendPort) {
  Write-Host "Backend port $requestedBackendPort is in use, falling back to $BackendPort"
}
if ($FrontendPort -ne $requestedFrontendPort) {
  Write-Host "Frontend port $requestedFrontendPort is in use, falling back to $FrontendPort"
}

# Persist resolved ports so stop-dev.ps1 can target the right ones.
$stateFile = Join-Path $scriptRoot '.edinav-dev-state.json'
@{
  backendPort  = $BackendPort
  frontendPort = $FrontendPort
  startedAt    = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Write-Host "Starting backend and frontend in this single window..."

# --- Backend job: Spring Boot on the resolved port, CORS pointed at the resolved UI port ---
$backendJob = Start-Job -Name 'edinav-backend' -ScriptBlock {
  param([string]$Dir, [int]$Port, [int]$UiPort, [string]$JavaHome, [string]$MavenBin)

  Set-Location $Dir
  $env:JAVA_HOME = $JavaHome
  $env:Path = "$JavaHome\bin;$env:Path"

  # Program arguments travel reliably through the spring-boot:run fork (unlike env vars).
  # run.arguments tokenizes on whitespace; neither value below contains spaces.
  $runArgs = "--server.port=$Port --app.cors.allowed-origins=http://localhost:$UiPort"
  & $MavenBin spring-boot:run "-Dspring-boot.run.arguments=$runArgs" 2>&1 | ForEach-Object { $_.ToString() }
} -ArgumentList $backendDir, $BackendPort, $FrontendPort, $JavaHome, $MavenBin

Write-Host "Waiting for backend to be ready on port $BackendPort..."
$maxWait = 180
$waited = 0
$ready = $false
while ($waited -lt $maxWait) {
  Receive-Job -Job $backendJob -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "[backend] $_"
  }

  if ($backendJob.State -in @('Completed', 'Failed', 'Stopped')) {
    Write-Host "Backend job ended before binding (state=$($backendJob.State))."
    break
  }

  $conn = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $ready = $true; break }
  Start-Sleep -Seconds 1
  $waited++
  if ($waited % 10 -eq 0) { Write-Host "  still waiting... ($waited s)" }
}

if (-not $ready) {
  Write-Host "Backend did not start within $maxWait seconds. Starting frontend anyway."
} else {
  Write-Host "Backend is ready after ${waited}s."
}

# --- Frontend job: Vite dev server; BACKEND_PORT drives the /api proxy target ---
$frontendJob = Start-Job -Name 'edinav-frontend' -ScriptBlock {
  param([string]$Dir, [int]$ApiPort, [int]$Port, [string]$NodeHome)

  Set-Location $Dir
  $env:Path              = "$NodeHome;$env:Path"
  $env:BACKEND_PORT      = "$ApiPort"
  $env:FRONTEND_PORT     = "$Port"
  $env:VITE_BACKEND_PORT = "$ApiPort"

  $npmCmd = Join-Path $NodeHome 'npm.cmd'
  if (-not (Test-Path 'node_modules')) { & $npmCmd install }
  & $npmCmd run dev -- --host 0.0.0.0 --port $Port --strictPort 2>&1 | ForEach-Object { $_.ToString() }
} -ArgumentList $frontendDir, $BackendPort, $FrontendPort, $NodeHome

Write-Host ""
Write-Host "==============================================="
Write-Host " EDI Pipeline Navigator running"
Write-Host "   Backend  : http://localhost:$BackendPort"
Write-Host "   Frontend : http://localhost:$FrontendPort"
Write-Host "   H2       : http://localhost:$BackendPort/h2-console"
Write-Host " Press Ctrl+C to stop log streaming (jobs keep running)."
Write-Host " Use .\stop-dev.ps1 to shut down."
Write-Host "==============================================="
Write-Host ""

try {
  while ($true) {
    $hadOutput = $false

    Receive-Job -Job $backendJob -ErrorAction SilentlyContinue | ForEach-Object {
      $hadOutput = $true
      Write-Host "[backend] $_"
    }

    Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue | ForEach-Object {
      $hadOutput = $true
      Write-Host "[frontend] $_"
    }

    $backendDone = $backendJob.State -in @('Completed', 'Failed', 'Stopped')
    $frontendDone = $frontendJob.State -in @('Completed', 'Failed', 'Stopped')

    if ($backendDone -and $frontendDone) {
      break
    }

    if (-not $hadOutput) {
      Start-Sleep -Milliseconds 250
    }
  }
}
finally {
  Write-Host "`nProcess states: backend=$($backendJob.State), frontend=$($frontendJob.State)"

  if ($backendJob.State -notin @('Completed', 'Failed', 'Stopped')) {
    Stop-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
  }
  if ($frontendJob.State -notin @('Completed', 'Failed', 'Stopped')) {
    Stop-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
  }
  Remove-Job -Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}
