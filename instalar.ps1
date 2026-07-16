param(
    [string]$PythonExe = "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "No se encontro Python 3.13 en: $PythonExe"
}

Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $VenvPython)) {
    & $PythonExe -E -m venv (Join-Path $Backend ".venv")
}

& $VenvPython -E -m pip install --upgrade pip
& $VenvPython -E -m pip install -r (Join-Path $Backend "requirements.txt")

$EnvFile = Join-Path $Backend ".env"
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath (Join-Path $Backend ".env.example") -Destination $EnvFile
    Write-Host "Se creo backend\.env. Edite sus credenciales antes de iniciar." -ForegroundColor Yellow
}

Write-Host "Instalacion completada." -ForegroundColor Green
Write-Host "Siguiente paso: editar backend\.env y ejecutar .\iniciar.ps1"
