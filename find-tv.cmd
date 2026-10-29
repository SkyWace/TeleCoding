@echo off
chcp 65001 >nul
rem Trouve la TV Samsung sur le réseau. Voir scripts\find-tv.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\find-tv.ps1" %*
