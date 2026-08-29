@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0build-prod.ps1" %*
