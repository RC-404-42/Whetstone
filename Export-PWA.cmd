@echo off
cd /d "%~dp0"
Whetstone.exe --export "%~dp0PWA"
if errorlevel 1 (
  echo Export failed. Move or rename an existing PWA folder, then try again.
) else (
  echo Done. The complete PWA is in the PWA folder.
)
pause
