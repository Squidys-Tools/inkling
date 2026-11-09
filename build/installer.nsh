; electron-builder picks this file up as nsis.include. customInstall runs after the install
; is registered; NSIS registers it and exits 0 even when it wrote no files (for example when
; the install folder cannot be created), which leaves an "inkling" entry pointing at nothing.
!macro customInstall
  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
    Delete "$newStartMenuLink"
    Delete "$newDesktopLink"
    ; apps/setup reads exit code 3 as "no files were written".
    SetErrorLevel 3
    Quit
  ${EndIf}
!macroend
