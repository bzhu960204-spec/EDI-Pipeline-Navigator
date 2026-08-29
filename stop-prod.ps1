param(
  [int]$Port = 0
)

# Stops the single-port prod process started by start-prod.ps1. Reads the
# resolved port from .edinav-prod-state.json when not passed explicitly.

$ErrorActionPreference = 'Continue'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $scriptRoot '.edinav-prod-state.json'

if ($Port -le 0 -and (Test-Path $stateFile)) {
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($state.port) { $Port = [int]$state.port }
  } catch {
    Write-Host "Failed to read $stateFile : $($_.Exception.Message)"
  }
}

if ($Port -le 0) { $Port = 8080 }

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "No listening process on port $Port"
} else {
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId on port $Port"
    } catch {
      Write-Host "Failed to stop process $processId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

if (Test-Path $stateFile) { Remove-Item $stateFile -ErrorAction SilentlyContinue }
