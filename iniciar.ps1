$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Backend ".env"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Falta el entorno Python. Ejecute primero .\instalar.ps1"
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Falta backend\.env. Ejecute primero .\instalar.ps1"
}

Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

Set-Location -LiteralPath $Backend
Write-Host "Inventario Lima disponible en http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Para detenerlo presione Ctrl+C."
& $Python -E -m uvicorn app.main:app --host 127.0.0.1 --port 8000
