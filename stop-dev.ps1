param(
  [int[]]$Ports = @(),
  [int]$BackendPort = 0
)

$ErrorActionPreference = 'Continue'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $scriptRoot '.edinav-dev-state.json'

# Load resolved ports from start-dev state file if present.
if (Test-Path $stateFile) {
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($BackendPort -le 0 -and $state.backendPort) { $BackendPort = [int]$state.backendPort }
    if ($Ports.Count -eq 0 -and $state.backendPort -and $state.frontendPort) {
      $Ports = @([int]$state.frontendPort, [int]$state.backendPort)
    }
  } catch {
    Write-Host "Failed to read $stateFile : $($_.Exception.Message)"
  }
}

if ($BackendPort -le 0) { $BackendPort = 8080 }
if ($Ports.Count -eq 0) { $Ports = @(5173, 8080) }

# Force-kill anything still bound on the listed ports.
foreach ($port in $Ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Host "No listening process on port $port"
    continue
  }

  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId on port $port"
    } catch {
      Write-Host "Failed to stop process $processId on port ${port}: $($_.Exception.Message)"
    }
  }
}

# Clean up background jobs started by start-dev.ps1.
Get-Job -Name 'edinav-backend', 'edinav-frontend' -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Job $_ -ErrorAction SilentlyContinue
  Remove-Job $_ -Force -ErrorAction SilentlyContinue
}

if (Test-Path $stateFile) {
  Remove-Item $stateFile -ErrorAction SilentlyContinue
}
