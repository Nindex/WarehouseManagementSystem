; NSIS 安装程序自定义脚本
; 用于保护数据库文件不被覆盖或删除

; 安装模式检测变量
Var IsUpgrade
Var UninstallSilent

; 初始化时检测是否是升级安装
!macro preInit
  ; 默认设置
  StrCpy $IsUpgrade "0"
  StrCpy $UninstallSilent "0"
  
  ; 检查注册表中是否已有安装（判断是否是升级）
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  StrCmp $0 "" check_cu
  StrCpy $IsUpgrade "1"
  StrCpy $UninstallSilent "1"
  Goto done_check
  
  check_cu:
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    StrCmp $0 "" done_check
    StrCpy $IsUpgrade "1"
    StrCpy $UninstallSilent "1"
    
  done_check:
!macroend

; 自定义删除文件 - 在升级时保留 data 目录
!macro customRemoveFiles
  StrCmp $IsUpgrade "1" 0 do_normal_remove
    
    ; 这是升级安装，只删除程序文件，保留 data 目录
    DetailPrint "升级安装：保留数据文件..."
    
    ; 删除程序文件和目录（排除 data 和 logs）
    RMDir /r "$INSTDIR\dist"
    RMDir /r "$INSTDIR\.vite"
    RMDir /r "$INSTDIR\scripts"
    RMDir /r "$INSTDIR\node_modules"
    RMDir /r "$INSTDIR\resources"
    
    ; 删除根目录下的文件（但保留 data 和 logs 目录）
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

; 卸载时处理 - 始终保留数据库，不提示
!macro customUnInstall
  ; 无论是否升级，都保留数据文件，不显示任何提示
  DetailPrint "保留数据文件..."
  Return
!macroend

; 安装完成后
!macro customInstall
  ; 确保 data 目录存在
  IfFileExists "$INSTDIR\data" data_exists
    CreateDirectory "$INSTDIR\data"
    DetailPrint "创建数据目录..."
  data_exists:
  
  ; 确保 logs 目录存在
  IfFileExists "$INSTDIR\logs" logs_exists
    CreateDirectory "$INSTDIR\logs"
    DetailPrint "创建日志目录..."
  logs_exists:
  
  ; 如果是升级安装，不需要迁移数据（data 目录已保留）
  StrCmp $IsUpgrade "1" 0 check_migration
    DetailPrint "升级完成，数据已保留"
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
    DetailPrint "发现旧版本数据，正在迁移..."
    CopyFiles "$0\data\inventory.db" "$INSTDIR\data\inventory.db"
    IfFileExists "$0\data\backups\*.*" 0 migration_done
    CreateDirectory "$INSTDIR\data\backups"
    CopyFiles "$0\data\backups\*.*" "$INSTDIR\data\backups"
    
  migration_done:
    DetailPrint "数据迁移完成"
    
  done_install:
!macroend
