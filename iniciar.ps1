$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Backend ".env"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Falta el entorno Python. Ejecute primero .\instalar.ps1"
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Falta backend\.env. Ejecute primero .\instalar.ps1"
}

$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $Npm) {
    throw "Falta Node.js/npm. Instale Node.js para compilar el frontend."
}

Push-Location -LiteralPath $Frontend
try {
    if (-not (Test-Path -LiteralPath (Join-Path $Frontend "node_modules"))) {
        Write-Host "Instalando dependencias del frontend..." -ForegroundColor Cyan
        & $Npm.Source install
        if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias del frontend." }
    }

    Write-Host "Compilando frontend actualizado..." -ForegroundColor Cyan
    & $Npm.Source run build
    if ($LASTEXITCODE -ne 0) { throw "No se pudo compilar el frontend." }
}
finally {
    Pop-Location
}

Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

Set-Location -LiteralPath $Backend
Write-Host "Inventario Lima disponible en http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Para detenerlo presione Ctrl+C."
& $Python -E -m uvicorn app.main:app --host 127.0.0.1 --port 8000
