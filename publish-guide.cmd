@echo off
setlocal
cd /d "%~dp0"
echo Este archivo solo orienta: revisa la carpeta del repositorio antes de continuar.
git rev-parse --show-toplevel
if errorlevel 1 exit /b 1
git remote -v
git status --short
echo.
echo Cuando hayas revisado que no haya claves ni archivos personales en la lista, ejecuta cada comando por separado:
echo git add .
echo git diff --cached --check
echo git diff --cached --stat
echo git commit -m "feat: mejora CotizaFacil y prepara Supabase"
echo git push -u origin main
echo.
echo Si git push pide iniciar sesion, usa Git Credential Manager o GitHub Desktop.
echo No compartas tokens ni claves en esta ventana o en el chat.
