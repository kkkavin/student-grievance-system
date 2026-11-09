<#
.SYNOPSIS
    Automated PostgreSQL 16 Setup, Service Manager & Database Provisioner
.DESCRIPTION
    Checks if PostgreSQL is listening on localhost:5432.
    If not, attempts to start an existing Windows service or installs PostgreSQL 16
    silently via winget / chocolatey (if elevated).
    Then invokes the Python setup helper to provision 'campus_grievance_db' with pgvector
    and configure active connection strings in .env and backend/.env.
#>

[CmdletBinding()]
param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$Database = "campus_grievance_db",
    [string]$User = "postgres",
    [string]$Password = "postgres",
    [int]$WaitTimeoutSec = 3
)

$ErrorActionPreference = "Continue"

# Resolve script root and project root reliably
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Join-Path (Get-Location).Path "scripts") }
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   CAMPUS GRIEVANCE SYSTEM: PostgreSQL Setup Manager    " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Helper: Fast TCP Socket Test (<1s)
# ---------------------------------------------------------------------------
function Test-FastTcpPort {
    param(
        [string]$Server = "127.0.0.1",
        [int]$TargetPort = 5432,
        [int]$TimeoutMs = 800
    )
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $tcpClient.BeginConnect($Server, $TargetPort, $null, $null)
        $waitSuccess = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($waitSuccess -and $tcpClient.Connected) {
            $tcpClient.EndConnect($asyncResult)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $tcpClient.Close()
        $tcpClient.Dispose()
    }
}

# ---------------------------------------------------------------------------
# Helper: Resolve Python Executable
# ---------------------------------------------------------------------------
function Get-PythonExecutable {
    $candidates = @(
        (Join-Path $RootDir ".venv\Scripts\python.exe"),
        (Join-Path $RootDir "backend\.venv\Scripts\python.exe"),
        "python.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq "python.exe") {
            $cmd = Get-Command "python.exe" -ErrorAction SilentlyContinue
            if ($cmd) { return $cmd.Source }
        } elseif (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }
    return $null
}

# ---------------------------------------------------------------------------
# Step 1: Detect Port 5432
# ---------------------------------------------------------------------------
Write-Host "[SETUP] Checking if PostgreSQL is listening on ${HostName}:${Port}..." -ForegroundColor Yellow
$isListening = Test-FastTcpPort -Server $HostName -TargetPort $Port -TimeoutMs 1000

if (-not $isListening) {
    Write-Host "[SETUP] Port $Port is not listening." -ForegroundColor Yellow
    
    # -----------------------------------------------------------------------
    # Step 2: Check for existing Windows Service
    # -----------------------------------------------------------------------
    Write-Host "[SETUP] Inspecting Windows services for PostgreSQL..." -ForegroundColor Yellow
    $pgService = Get-Service -Name "*postgres*" -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($pgService) {
        Write-Host "[SETUP] Found service '$($pgService.Name)' (Status: $($pgService.Status))." -ForegroundColor Cyan
        if ($pgService.Status -ne "Running") {
            Write-Host "[SETUP] Attempting to start service '$($pgService.Name)'..." -ForegroundColor Yellow
            try {
                Start-Service -Name $pgService.Name -ErrorAction Stop
                Write-Host "[SETUP] Service start initiated. Waiting for port listener..." -ForegroundColor Cyan
            } catch {
                Write-Host "[WARN] Could not start service '$($pgService.Name)': $_" -ForegroundColor DarkYellow
            }
        }
    } else {
        # -------------------------------------------------------------------
        # Step 3: Automated Installation (winget / choco / docker)
        # -------------------------------------------------------------------
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

        if (-not $isAdmin) {
            Write-Host "[SETUP] No registered PostgreSQL service found on system." -ForegroundColor Yellow
            Write-Host "[SETUP] Current session is non-elevated. Skipping package manager installation to prevent blocking interactive UAC prompt." -ForegroundColor DarkYellow
            Write-Host "[INFO] To install PostgreSQL natively, open an Administrator PowerShell and run:" -ForegroundColor Cyan
            Write-Host "       winget install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements`n" -ForegroundColor Gray
        } else {
            Write-Host "[SETUP] Elevated Administrator session detected. Attempting automated install..." -ForegroundColor Yellow

            $wingetPath = (Get-Command winget.exe -ErrorAction SilentlyContinue).Source
            if (-not $wingetPath) {
                $defaultWinget = "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
                if (Test-Path $defaultWinget) { $wingetPath = $defaultWinget }
            }

            $installed = $false

            if ($wingetPath) {
                Write-Host "[SETUP] Installing PostgreSQL 16 via winget ($wingetPath)..." -ForegroundColor Cyan
                try {
                    $p = Start-Process -FilePath $wingetPath -ArgumentList "install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements" -NoNewWindow -PassThru -Wait
                    if ($p.ExitCode -eq 0) {
                        Write-Host "[SETUP] Winget installation succeeded." -ForegroundColor Green
                        $installed = $true
                    } else {
                        Write-Host "[WARN] Winget returned exit code $($p.ExitCode)." -ForegroundColor DarkYellow
                    }
                } catch {
                    Write-Host "[WARN] Winget install failed: $_" -ForegroundColor DarkYellow
                }
            }

            # Fallback to chocolatey if winget failed
            if (-not $installed) {
                $chocoPath = (Get-Command choco.exe -ErrorAction SilentlyContinue).Source
                if ($chocoPath) {
                    Write-Host "[SETUP] Attempting installation via Chocolatey..." -ForegroundColor Cyan
                    try {
                        $p = Start-Process -FilePath $chocoPath -ArgumentList "install postgresql16 -y --params '/Password:postgres' --no-progress" -NoNewWindow -PassThru -Wait
                        if ($p.ExitCode -eq 0) { $installed = $true }
                    } catch {
                        Write-Host "[WARN] Chocolatey install failed: $_" -ForegroundColor DarkYellow
                    }
                }
            }

            # Check for service again after install
            $pgService = Get-Service -Name "*postgres*" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($pgService -and $pgService.Status -ne "Running") {
                Start-Service -Name $pgService.Name -ErrorAction SilentlyContinue
            }
        }
    }

    # -----------------------------------------------------------------------
    # Step 4: Poll Port 5432 up to timeout
    # -----------------------------------------------------------------------
    if ($pgService) {
        Write-Host "[SETUP] Polling ${HostName}:${Port} (timeout: ${WaitTimeoutSec}s)..." -ForegroundColor Yellow
        $elapsed = 0
        while ($elapsed -lt $WaitTimeoutSec) {
            Start-Sleep -Seconds 1
            $elapsed++
            if (Test-FastTcpPort -Server $HostName -TargetPort $Port -TimeoutMs 500) {
                $isListening = $true
                break
            }
        }
    }
}

if ($isListening) {
    Write-Host "[OK] PostgreSQL is active and listening on ${HostName}:${Port}!" -ForegroundColor Green
} else {
    Write-Host "`n[WARN] PostgreSQL service is not active on ${HostName}:${Port}." -ForegroundColor DarkYellow
    Write-Host "[INFO] The system will automatically use the high-performance SQLite fallback (backend.sqlite)." -ForegroundColor Cyan
    Write-Host "[INFO] To enable live PostgreSQL manually:" -ForegroundColor Cyan
    Write-Host "       1. Start PostgreSQL service via 'Start-Service postgresql*'" -ForegroundColor Gray
    Write-Host "       2. Or run: docker run --name campus-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=campus_grievance_db -p 5432:5432 -d pgvector/pgvector:pg16`n" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# Step 5: Execute Python Database Provisioner & .env Synchronizer
# ---------------------------------------------------------------------------
$pythonExe = Get-PythonExecutable

if (-not $pythonExe) {
    Write-Host "[ERROR] Could not locate python.exe. Please ensure .venv or Python is configured." -ForegroundColor Red
    exit 1
}

Write-Host "[SETUP] Invoking Python provisioner with: $pythonExe" -ForegroundColor Cyan

$provisionerPaths = @(
    (Join-Path $RootDir "backend\app\db\setup_postgres.py"),
    (Join-Path $RootDir "backend\db\setup_postgres.py")
)

$targetScript = $null
foreach ($p in $provisionerPaths) {
    if (Test-Path $p) {
        $targetScript = $p
        break
    }
}

if ($targetScript) {
    Write-Host "[SETUP] Running provisioner script: $targetScript" -ForegroundColor Cyan
    & $pythonExe $targetScript
} else {
    $env:PYTHONPATH = "$RootDir;$RootDir\backend"
    & $pythonExe -m app.db.setup_postgres 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $pythonExe -m backend.db.setup_postgres 2>$null
    }
}

Write-Host "`n[SETUP] PostgreSQL setup workflow complete.`n" -ForegroundColor Green
exit 0
