@echo off
setlocal
node "%~dp0cx.mjs" %*
exit /b %errorlevel%
