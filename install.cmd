@echo off
chcp 65001 >nul
rem Compile, signe, installe et lance TeleCoding. Voir scripts\deploy.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
