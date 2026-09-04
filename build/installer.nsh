; Custom NSIS script for ArticsChat installer
; Creates startup shortcut on install, removes on uninstall

!macro customInstall
  ; Create shortcut in Windows Startup folder
  ; $SMSTARTUP = C:\Users\<username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
  CreateShortCut "$SMSTARTUP\ArticsChat.lnk" "$INSTDIR\ArticsChat.exe" "--hidden" "$INSTDIR\ArticsChat.exe" 0
!macroend

!macro customUnInstall
  ; Remove shortcut from Windows Startup folder
  Delete "$SMSTARTUP\ArticsChat.lnk"
!macroend
