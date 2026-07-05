' MarkView silent launcher — starts the app with no console window.
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = appDir
' Use pythonw via the py launcher so no console window appears.
sh.Run "pyw """ & appDir & "\app.py""", 0, False
