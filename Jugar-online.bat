@echo off
REM Doble clic para publicar la Ciudadela de Valdoria en Internet (Cloudflare Tunnel).
REM Necesita 'cloudflared' instalado (ver DEPLIEGUE.md).
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\online.ps1"
pause
