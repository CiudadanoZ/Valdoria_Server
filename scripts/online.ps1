# Publica la Ciudadela de Valdoria en Internet con Cloudflare Tunnel (gratis).
# Arranca el servidor del juego en una ventana aparte y abre un tunel que da un
# enlace publico https/wss para compartir. Para detener: cierra ambas ventanas.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# 1) Comprobar que cloudflared esta instalado
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host ""
  Write-Host "No encuentro 'cloudflared'." -ForegroundColor Yellow
  Write-Host "Instalalo con:  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  Write-Host "o descarga cloudflared-windows-amd64.exe de:" -ForegroundColor Yellow
  Write-Host "  https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Yellow
  Write-Host "y ponlo en una carpeta del PATH (o junto a este script)." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Pulsa Enter para salir"
  exit 1
}

# 2) Arrancar el servidor del juego en una ventana nueva (para ver sus registros)
Write-Host "Arrancando el servidor del juego (Ciudadela de Valdoria)..." -ForegroundColor Cyan
Start-Process -FilePath "powershell.exe" `
  -ArgumentList "-NoExit", "-Command", "cd '$root'; npm start" `
  -WindowStyle Normal

# Dar unos segundos a que el servidor empiece a escuchar en el puerto 3000
Start-Sleep -Seconds 4

# 3) Abrir el tunel. Cloudflare imprime un enlace https://<algo>.trycloudflare.com
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Abriendo el tunel de Cloudflare (gratis)." -ForegroundColor Green
Write-Host " Comparte con tus amigos el enlace https que aparezca" -ForegroundColor Green
Write-Host " abajo (algo como https://xxxx-yyyy.trycloudflare.com)." -ForegroundColor Green
Write-Host " El WSS es automatico: no tienes que configurar nada mas." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

cloudflared tunnel --url http://localhost:3000
