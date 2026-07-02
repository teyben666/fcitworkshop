# Currency Safe — classroom server quick start (Windows PowerShell)
# Usage: .\scripts\start-classroom.ps1
# Optional Postgres: docker compose up -d  (from repo root)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "Currency Safe classroom start" -ForegroundColor Cyan
Write-Host "Repo: $Root"

$compose = Join-Path $Root "docker-compose.yml"
if (Test-Path $compose) {
    $pg = docker compose -f $compose ps --services --filter "status=running" 2>$null
    if ($pg -notmatch "db") {
        Write-Host "Starting Postgres (docker compose)..." -ForegroundColor Yellow
        Push-Location $Root
        docker compose up -d
        Pop-Location
        Start-Sleep -Seconds 2
    }
    $env:DATABASE_URL = "postgresql://currency:currency@localhost:5432/currency_safe"
    Write-Host "DATABASE_URL set for Postgres" -ForegroundColor Green
} else {
    Write-Host "No docker-compose.yml — using JSON file storage" -ForegroundColor Yellow
}

$serverDir = Join-Path $Root "server"
if (-not (Test-Path (Join-Path $serverDir "node_modules"))) {
    Write-Host "npm install in server/..." -ForegroundColor Yellow
    Push-Location $serverDir
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "Health:  http://localhost:3000/health" -ForegroundColor Green
Write-Host "QA:      cd server; npm run qa" -ForegroundColor Green
Write-Host "Stop:    Ctrl+C" -ForegroundColor Gray
Write-Host ""

Push-Location $serverDir
npm start
