@echo off
chcp 65001 >nul
rem Revient à l'accueil Samsung d'origine. Voir scripts\restore-original-home.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore-original-home.ps1" %*
