; NSIS 安装程序自定义脚本
; 用于保护数据库文件不被覆盖或删除

; 安装模式检测变量
Var IsUpgrade

; 初始化时检测是否是升级安装
!macro preInit
  ; 检测是否是升级安装
  StrCpy $IsUpgrade "0"
  
  ; 检查注册表中是否已有安装
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  StrCmp $0 "" check_cu
  StrCpy $IsUpgrade "1"
  Goto done_check
  
  check_cu:
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    StrCmp $0 "" done_check
    StrCpy $IsUpgrade "1"
    
  done_check:
!macroend

; 自定义删除文件 - 在升级时保留 data 目录
!macro customRemoveFiles
  StrCmp $IsUpgrade "1" 0 do_normal_remove
    
    ; 这是升级安装，只删除程序文件，保留 data 目录
    DetailPrint "Upgrade installation: keeping data files..."
    
    ; 删除程序文件和目录（排除 data）
    RMDir /r "$INSTDIR\dist"
    RMDir /r "$INSTDIR\.vite"
    RMDir /r "$INSTDIR\scripts"
    RMDir /r "$INSTDIR\node_modules"
    
    ; 删除根目录下的文件
    Delete "$INSTDIR\*.json"
    Delete "$INSTDIR\*.exe"
    Delete "$INSTDIR\*.dll"
    Delete "$INSTDIR\*.pak"
    Delete "$INSTDIR\*.bin"
    Delete "$INSTDIR\*.dat"
    Delete "$INSTDIR\*.ico"
    Delete "$INSTDIR\LICENSE*"
    Delete "$INSTDIR\version"
    
    ; 跳过后续的默认删除操作
    Return
    
  do_normal_remove:
    ; 真正的卸载，继续默认的删除操作
!macroend

; 卸载时处理
!macro customUnInstall
  StrCmp $IsUpgrade "1" 0 do_real_uninstall
    ; 升级安装，不删除 data 目录
    Return
    
  do_real_uninstall:
    ; 真正的卸载，询问用户
    MessageBox MB_YESNO|MB_ICONQUESTION "是否删除所有数据文件？选择[否]将保留数据库和备份文件。" IDYES delete_data IDNO keep_data
    
  delete_data:
    RMDir /r "$INSTDIR\data"
    Return
    
  keep_data:
    Return
!macroend

; 安装完成后
!macro customInstall
  ; 确保 data 目录存在
  IfFileExists "$INSTDIR\data" data_exists
    CreateDirectory "$INSTDIR\data"
    DetailPrint "Creating data directory..."
  data_exists:
  
  ; 如果是升级安装，不需要迁移数据（data 目录已保留）
  StrCmp $IsUpgrade "1" 0 check_migration
    DetailPrint "Upgrade complete, data preserved"
    Return
    
  check_migration:
    ; 首次安装，检查是否需要从旧版本迁移
    IfFileExists "$INSTDIR\data\inventory.db" done_install
    
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
    StrCmp $0 "" check_cu_install
    StrCmp $0 $INSTDIR check_cu_install
    Goto do_migration_check
    
  check_cu_install:
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
    StrCmp $0 "" done_install
    StrCmp $0 $INSTDIR done_install
    
  do_migration_check:
    IfFileExists "$0\data\inventory.db" do_migration done_install
    
  do_migration:
    DetailPrint "Found old version data, migrating..."
    CopyFiles "$0\data\inventory.db" "$INSTDIR\data\inventory.db"
    IfFileExists "$0\data\backups\*.*" 0 migration_done
    CreateDirectory "$INSTDIR\data\backups"
    CopyFiles "$0\data\backups\*.*" "$INSTDIR\data\backups"
    
  migration_done:
    DetailPrint "Data migration complete"
    
  done_install:
!macroend
