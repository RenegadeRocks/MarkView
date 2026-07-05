@echo off
REM Install MarkView dependencies
echo Installing MarkView dependencies...
py -m pip install --upgrade pywebview
echo.
echo Optional (better Word export):
echo   py -m pip install python-docx htmldocx
echo.
echo Done. Double-click MarkView.vbs (silent) or run.bat to start.
pause
