@echo off
setlocal
cd /d "%~dp0"
echo === CotizaFacil: verificaciones locales ===
if not exist backend\.venv\Scripts\python.exe (
  echo No encuentro backend\.venv. Primero instala dependencias con:
  echo cd backend
  echo py -m venv .venv
  echo .venv\Scripts\activate
  echo python -m pip install -r requirements.txt
  exit /b 1
)
echo [1/3] Sintaxis de Python...
backend\.venv\Scripts\python.exe -m compileall -q backend\app backend\scripts
if errorlevel 1 exit /b 1
echo [2/3] Imports de la aplicacion...
cd backend
.venv\Scripts\python.exe -c "from app.main import app; print('Aplicacion FastAPI importada correctamente')"
if errorlevel 1 exit /b 1
echo [3/3] Rutas principales...
.venv\Scripts\python.exe -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); r=c.get('/api/health'); print('GET /api/health:', r.status_code, r.json()); assert r.status_code == 200 and r.json().get('ok') is True"
if errorlevel 1 exit /b 1
cd ..
echo Todas las comprobaciones locales terminaron correctamente.
exit /b 0
