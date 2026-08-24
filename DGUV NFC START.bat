@echo off
cd /d "%~dp0"
echo Starte DGUV NFC Check mit lokalem USB-NFC Writer...
echo.
echo Browser-Adresse: http://127.0.0.1:8765
echo Dieses Fenster offen lassen, solange du NFC-Tags beschreibst.
echo.
start "" "http://127.0.0.1:8765"
node server.js
pause
