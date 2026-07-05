@echo off
REM Launch MarkView (shows a console window; pass --debug to open devtools)
cd /d "%~dp0"
py app.py %*
