@echo off
rem Install-ARSENAL.cmd: puts ARSENAL into a folder you pick, for this Windows user only. No administrator rights needed.
rem It copies the unzipped download, gets Node.js for the small download (through the download's own ARSENAL.cmd, which checks
rem the pinned sha256), checks what the tools depend on, makes a Start menu shortcut (and a Desktop one if you want) to the window,
rem and writes Uninstall-ARSENAL.cmd into the install folder. It never writes into a game folder or a mod folder.
rem usage: Install-ARSENAL.cmd [--dir <folder>] [--no-shortcuts] [--desktop] [--dry]     (/dir /no-shortcuts /desktop /dry too)
rem   --dir: install there and ask nothing (for unattended use).  --dry: print every step and change nothing.
rem        Install-ARSENAL.cmd --uninstall <folder> [--remove-caches | --keep-caches] [--dry]   (what Uninstall-ARSENAL.cmd runs)
rem Shipped at the top of the ARSENAL zips from tools/dist/launch/Install-ARSENAL.cmd; the release gate passes only these bytes.
rem Author: Imperator_Aug (ARSENAL)
setlocal EnableExtensions DisableDelayedExpansion
set "NoDefaultCurrentDirectoryInExePath=1"
set "AR_SYS32=%SystemRoot%\System32"
set "AR_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
rem this file's own path and name, taken before shift (shift moves %0 too)
set "AR_SELF=%~f0"
set "AR_ME=%~n0"
set "AR_HERE=%~dp0"
set "AR_HERE=%AR_HERE:~0,-1%"
set "AR_REC=ARSENAL-install.txt"
set "AR_DRY="
set "AR_DIR="
set "AR_GOTDIR="
set "AR_ASK=1"
set "AR_LINKS=1"
set "AR_DESK="
set "AR_UN="
set "AR_CACHES="
set "AR_RC=0"
set "AR_TMPF=%TEMP%\ARSENAL-install-%RANDOM%%RANDOM%.txt"

:ar_args
if "%~1"=="" goto :ar_argsdone
set "AR_A=%~1"
if "%AR_A:~0,1%"=="/" set "AR_A=--%AR_A:~1%"
if /i "%AR_A%"=="--dry" set "AR_DRY=1" & shift & goto :ar_args
if /i "%AR_A%"=="--no-shortcuts" set "AR_LINKS=" & shift & goto :ar_args
if /i "%AR_A%"=="--desktop" set "AR_DESK=1" & shift & goto :ar_args
if /i "%AR_A%"=="--remove-caches" set "AR_CACHES=yes" & shift & goto :ar_args
if /i "%AR_A%"=="--keep-caches" set "AR_CACHES=no" & shift & goto :ar_args
if /i "%AR_A%"=="--dir" set "AR_DIR=%~2" & set "AR_GOTDIR=1" & set "AR_ASK=" & shift & shift & goto :ar_args
if /i "%AR_A%"=="--uninstall" set "AR_DIR=%~2" & set "AR_GOTDIR=1" & set "AR_UN=1" & shift & shift & goto :ar_args
if /i "%AR_A%"=="--help" goto :ar_help
if /i "%AR_A%"=="-h" goto :ar_help
if /i "%AR_A%"=="--?" goto :ar_help
echo Install-ARSENAL: unknown option "%~1" 1>&2
goto :ar_usage
:ar_argsdone
if defined AR_GOTDIR if not defined AR_DIR echo Install-ARSENAL: --dir and --uninstall need a folder 1>&2 & goto :ar_usage
if defined AR_DIR set "AR_DIR=%AR_DIR:"=%"
if defined AR_UN goto :un

echo ARSENAL installer
if defined AR_DRY echo Dry run: every step is printed, nothing is changed.

rem 1. Windows 10 or 11, 64-bit
set "AR_VER="
set "AR_MAJ="
set "AR_BUILD="
for /f "tokens=2 delims=[]" %%V in ('ver') do set "AR_VER=%%V"
for /f "tokens=2,4 delims=. " %%A in ("%AR_VER%") do (set "AR_MAJ=%%A" & set "AR_BUILD=%%B")
if not defined AR_BUILD set "AR_BUILD=0"
if not "%AR_MAJ%"=="10" goto :ar_oldwin
set "AR_WIN=Windows 10"
if %AR_BUILD% GEQ 22000 set "AR_WIN=Windows 11"
set "AR_ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "AR_ARCH=%PROCESSOR_ARCHITEW6432%"
if /i "%AR_ARCH%"=="AMD64" goto :ar_winok
if /i "%AR_ARCH%"=="ARM64" goto :ar_winok
goto :ar_32bit
:ar_winok
echo   ok    system: %AR_WIN%, 64-bit (%AR_ARCH%, build %AR_BUILD%)
if /i "%AR_ARCH%"=="ARM64" echo   note  Windows on ARM: ARSENAL.exe runs through the x64 emulation of Windows 11. This has not been tried yet.

rem 2. the unzipped download next to this file
set "AR_KIND="
if exist "%AR_HERE%\ARSENAL.exe" set "AR_KIND=exe"
if not defined AR_KIND if exist "%AR_HERE%\ARSENAL.cmd" if exist "%AR_HERE%\tools\as2\as2.js" set "AR_KIND=small"
if not defined AR_KIND goto :ar_nopkg
if exist "%AR_HERE%\%AR_REC%" goto :ar_frominst

rem 3. the install folder
if not defined LOCALAPPDATA goto :ar_nolad
set "AR_DEF=%LOCALAPPDATA%\Programs\ARSENAL"
if defined AR_DIR goto :ar_havedir
if defined AR_DRY goto :ar_havedir
echo.
echo Install folder. Press Enter for "%AR_DEF%", or type another folder.
set "AR_IN="
set /p "AR_IN=Folder: "
if defined AR_IN set "AR_DIR=%AR_IN:"=%"
:ar_havedir
if not defined AR_DIR set "AR_DIR=%AR_DEF%"
for %%I in ("%AR_DIR%") do set "AR_DIR=%%~fI"
if "%AR_DIR:~-1%"=="\" set "AR_DIR=%AR_DIR:~0,-1%"
if "%AR_DIR:~3,1%"=="" goto :ar_badfolder
if /i "%AR_DIR%"=="%AR_HERE%" goto :ar_samefolder
if not "%AR_DIR:\steamapps\common\=%"=="%AR_DIR%" goto :ar_gamefolder
if exist "%AR_DIR%" if not exist "%AR_DIR%\" goto :ar_notdir
set "AR_OLD="
if exist "%AR_DIR%\%AR_REC%" set "AR_OLD=1"
set "AR_FULL="
if exist "%AR_DIR%\" for /f "delims=" %%F in ('dir /b /a "%AR_DIR%" 2^>nul') do set "AR_FULL=1"
if defined AR_FULL if not defined AR_OLD goto :ar_notempty
echo   from  "%AR_HERE%" (the %AR_KIND% download)
echo   to    "%AR_DIR%"
if defined AR_OLD echo   note  an earlier ARSENAL install is there: its files are replaced

rem 4. copy
set "AR_RECF=%AR_DIR%\%AR_REC%"
if defined AR_DRY goto :ar_drycopy
if not exist "%AR_DIR%\" mkdir "%AR_DIR%" 2>nul
if not exist "%AR_DIR%\" goto :ar_nowrite
"%AR_SYS32%\robocopy.exe" "%AR_HERE%" "%AR_DIR%" /E /COPY:DT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS /NP /XD "%AR_DIR%" >nul
if errorlevel 8 goto :ar_copyfail
> "%AR_RECF%" echo ARSENAL install record, written by Install-ARSENAL.cmd. Uninstall-ARSENAL.cmd removes only what is listed here.
for /f "delims=" %%N in ('dir /b /a "%AR_HERE%"') do >> "%AR_RECF%" echo item %%N
>> "%AR_RECF%" echo item Uninstall-ARSENAL.cmd
>> "%AR_RECF%" echo item %AR_REC%
echo   ok    copied the toolkit
goto :ar_copied
:ar_drycopy
echo   dry   would copy into the install folder:
for /f "delims=" %%N in ('dir /b /a "%AR_HERE%"') do echo           %%N
echo   dry   would write %AR_REC% (the list the uninstaller uses) and Uninstall-ARSENAL.cmd there
:ar_copied

rem 5. Node.js (small download only): the installed ARSENAL.cmd finds it or fetches the pinned version and checks its sha256
set "AR_RUN=%AR_DIR%\ARSENAL.exe"
if "%AR_KIND%"=="exe" goto :ar_nodedone
set "AR_RUN=%AR_DIR%\ARSENAL.cmd"
if not defined AR_DRY goto :ar_nodego
echo   dry   would run ARSENAL.cmd version in the install folder: it uses Node.js 26 or newer if this computer has it,
echo         else it downloads the pinned Node.js from nodejs.org and checks its sha256 before unpacking
goto :ar_nodedone
:ar_nodego
call "%AR_RUN%" version >"%AR_TMPF%"
if errorlevel 1 goto :ar_nonode
if exist "%AR_DIR%\node\" if not exist "%AR_HERE%\node\" >> "%AR_RECF%" echo item node
if exist "%AR_DIR%\node\" echo   ok    Node.js: the pinned version is in "%AR_DIR%\node" (sha256 checked)
if not exist "%AR_DIR%\node\" echo   ok    Node.js: uses the Node.js 26 or newer already on this computer
goto :ar_nodedone
:ar_nonode
echo   no    Node.js: the small download could not get Node.js (see the message above). Install Node.js 26 or newer from
echo         https://nodejs.org, or check the connection, then start ARSENAL.cmd once more.
set "AR_RC=1"
:ar_nodedone

rem 6. what the tools depend on, one line each
set "AR_BR="
for /f "tokens=2,*" %%A in ('%AR_SYS32%\reg.exe query "HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" /v ProgId 2^>nul') do set "AR_BR=%%B"
set "AR_BRN=%AR_BR%"
if defined AR_BR if /i "%AR_BR%"=="ChromeHTML" set "AR_BRN=Google Chrome"
if defined AR_BR if /i "%AR_BR%"=="MSEdgeHTM" set "AR_BRN=Microsoft Edge"
if defined AR_BR if /i "%AR_BR:~0,10%"=="FirefoxURL" set "AR_BRN=Mozilla Firefox"
if defined AR_BR echo   ok    web browser: %AR_BRN% is the default, the window opens there
if not defined AR_BR echo   --    web browser: no default browser is set for this user. The window prints its address; open it in any browser.
echo   --    WebGL: cannot be checked from here. Only the 3D view on the Models page needs it (current Chrome, Edge and Firefox have it).
set "AR_CD=%LOCALAPPDATA%\ARSENAL\cache"
if defined AR_DRY echo   dry   would check that the cache folder "%AR_CD%" can be written & goto :ar_cachedone
set "AR_MADE1="
set "AR_MADE2="
if not exist "%LOCALAPPDATA%\ARSENAL\" set "AR_MADE1=1"
if not exist "%AR_CD%\" set "AR_MADE2=1"
if not exist "%AR_CD%\" mkdir "%AR_CD%" 2>nul
set "AR_PROBE=%AR_CD%\write-test-%RANDOM%.tmp"
(type nul >"%AR_PROBE%") 2>nul
set "AR_CW="
if exist "%AR_PROBE%" set "AR_CW=1"
del /f /q "%AR_PROBE%" 2>nul
if defined AR_MADE2 rd "%AR_CD%" 2>nul
if defined AR_MADE1 rd "%LOCALAPPDATA%\ARSENAL" 2>nul
if defined AR_CW echo   ok    cache folder: "%AR_CD%" can be written
if not defined AR_CW echo   no    cache folder: "%AR_CD%" cannot be written. The tools still run, but slower, and the window forgets its settings.
:ar_cachedone
if defined AR_DRY echo   dry   would run ARSENAL game to look for Men of War: Assault Squad 2 (optional) & goto :ar_gamedone
if "%AR_RC%"=="1" goto :ar_gamedone
call "%AR_RUN%" game >"%AR_TMPF%" 2>nul
if errorlevel 1 goto :ar_nogame
set "AR_GL="
set /p AR_GL=<"%AR_TMPF%"
echo   ok    Men of War: Assault Squad 2: "%AR_GL%"
goto :ar_gamedone
:ar_nogame
echo   --    Men of War: Assault Squad 2: not found. It is optional; check, install and play need it. Later: ARSENAL game --game "<folder>"
:ar_gamedone

rem 7. shortcuts to the window
if not defined AR_LINKS echo   --    shortcuts: none (--no-shortcuts) & goto :ar_linksdone
if not defined AR_ASK goto :ar_linkgo
if defined AR_DRY goto :ar_linkgo
if defined AR_DESK goto :ar_linkgo
set "AR_YN="
set /p "AR_YN=Also put an ARSENAL shortcut on the Desktop? [y/N]: "
if /i "%AR_YN%"=="y" set "AR_DESK=1"
if /i "%AR_YN%"=="yes" set "AR_DESK=1"
:ar_linkgo
set "AR_TGT=%AR_DIR%\ARSENAL-gui.cmd"
set "AR_LARG="
if "%AR_KIND%"=="exe" set "AR_TGT=%AR_DIR%\ARSENAL.exe"
if "%AR_KIND%"=="exe" set "AR_LARG=gui"
set "AR_PSC=$w=New-Object -ComObject WScript.Shell; $d=if($env:AR_WHERE -eq 'desktop'){[Environment]::GetFolderPath('Desktop')}else{[Environment]::GetFolderPath('Programs')}; $l=Join-Path $d 'ARSENAL.lnk'; $s=$w.CreateShortcut($l); $s.TargetPath=$env:AR_TGT; $s.Arguments=$env:AR_LARG; $s.WorkingDirectory=$env:AR_DIR; $s.Description='ARSENAL window'; $s.Save(); $l"
set "AR_WHERE=start"
call :ar_link
if defined AR_DESK set "AR_WHERE=desktop" & call :ar_link
:ar_linksdone

rem 8. the uninstaller
set "AR_U=%AR_DIR%\Uninstall-ARSENAL.cmd"
if defined AR_DRY goto :ar_written
> "%AR_U%" echo @echo off
>> "%AR_U%" echo rem ARSENAL uninstaller, written by Install-ARSENAL.cmd. It removes only what ARSENAL-install.txt in this folder lists
>> "%AR_U%" echo rem (the installed files and the shortcuts) and, after asking, the caches in %%LOCALAPPDATA%%\ARSENAL.
>> "%AR_U%" echo rem It never removes a mod folder and never touches the game folder.
>> "%AR_U%" echo rem usage: Uninstall-ARSENAL.cmd [--remove-caches ^| --keep-caches] [--dry]
>> "%AR_U%" echo "%%~dp0Install-ARSENAL.cmd" --uninstall "%%~dp0." %%*
echo   ok    wrote "%AR_U%"
:ar_written
if exist "%AR_TMPF%" del /f /q "%AR_TMPF%"
echo.
if defined AR_DRY echo Dry run done: nothing was changed. & goto :ar_end
echo ARSENAL is installed in "%AR_DIR%".
echo Start it from the ARSENAL shortcut, or with ARSENAL-gui.cmd in that folder. Commands: ARSENAL help in a command prompt there.
echo Remove it with Uninstall-ARSENAL.cmd in that folder.
:ar_end
if defined AR_ASK pause
exit /b %AR_RC%

:ar_link
if "%AR_WHERE%"=="desktop" set "AR_WN=on the Desktop"
if "%AR_WHERE%"=="start" set "AR_WN=in the Start menu"
if defined AR_DRY echo   dry   would make an ARSENAL shortcut %AR_WN% that opens the window & goto :eof
if not exist "%AR_PS%" echo   no    shortcut %AR_WN%: Windows PowerShell is missing, none made & goto :eof
"%AR_PS%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "%AR_PSC%" >"%AR_TMPF%" 2>nul
set "AR_LNK="
for /f "usebackq delims=" %%L in ("%AR_TMPF%") do if not defined AR_LNK set "AR_LNK=%%L"
if not defined AR_LNK echo   no    shortcut %AR_WN%: could not be made & goto :eof
if not exist "%AR_LNK%" echo   no    shortcut %AR_WN%: could not be made & goto :eof
for /f "usebackq delims=" %%L in ("%AR_TMPF%") do >> "%AR_RECF%" echo link %%L
echo   ok    shortcut %AR_WN%: "%AR_LNK%"
goto :eof

rem ---- uninstall: Uninstall-ARSENAL.cmd hands over to the copy in the install folder, which copies itself to %TEMP% and hands over
rem again (no call: control never comes back to a file that is being removed). The temp copy removes the listed items, then itself.
:un
for %%I in ("%AR_DIR%") do set "AR_DIR=%%~fI"
if "%AR_DIR:~-1%"=="\" set "AR_DIR=%AR_DIR:~0,-1%"
set "AR_RECF=%AR_DIR%\%AR_REC%"
if not exist "%AR_RECF%" goto :un_norec
if /i not "%AR_ME:~0,18%"=="ARSENAL-uninstall-" goto :un_relay
cd /d "%TEMP%" 2>nul || cd /d "%SystemRoot%"
echo ARSENAL uninstaller
if defined AR_DRY echo Dry run: every step is printed, nothing is changed.
echo   folder "%AR_DIR%"
for /f "usebackq tokens=1,* delims= " %%A in ("%AR_RECF%") do if "%%A"=="link" set "AR_N=%%B" & call :un_link
for /f "usebackq tokens=1,* delims= " %%A in ("%AR_RECF%") do if "%%A"=="item" set "AR_N=%%B" & call :un_item
if defined AR_DRY goto :un_caches
set "AR_LEFT="
if exist "%AR_DIR%\" for /f "delims=" %%F in ('dir /b /a "%AR_DIR%" 2^>nul') do set "AR_LEFT=1" & echo   kept  "%AR_DIR%\%%F" (not made by the installer)
if not defined AR_LEFT rd "%AR_DIR%" 2>nul
if not defined AR_LEFT if not exist "%AR_DIR%\" echo   ok    removed the folder "%AR_DIR%"
:un_caches
set "AR_DATA=%LOCALAPPDATA%\ARSENAL"
if not defined LOCALAPPDATA goto :un_done
if not exist "%AR_DATA%\" goto :un_done
if "%AR_CACHES%"=="no" goto :un_keepc
if "%AR_CACHES%"=="yes" goto :un_rmc
if defined AR_DRY echo   dry   would ask whether to remove the caches and window settings in "%AR_DATA%" & goto :un_done
echo Also remove the ARSENAL caches and window settings in "%AR_DATA%"?
set "AR_YN="
set /p "AR_YN=[y/N]: "
if /i "%AR_YN%"=="y" goto :un_rmc
if /i "%AR_YN%"=="yes" goto :un_rmc
:un_keepc
echo   kept  "%AR_DATA%" (caches and window settings)
goto :un_done
:un_rmc
dir /s /b /a-d "%AR_DATA%\mod.info" >nul 2>&1
if not errorlevel 1 echo   kept  "%AR_DATA%": a mod folder is inside it & goto :un_done
if defined AR_DRY echo   dry   would remove "%AR_DATA%" (caches and window settings) & goto :un_done
rd /s /q "%AR_DATA%" 2>nul
if exist "%AR_DATA%\" echo   no    could not remove all of "%AR_DATA%" & set "AR_RC=1" & goto :un_done
echo   ok    removed "%AR_DATA%" (caches and window settings)
:un_done
if defined AR_DRY echo Dry run done: nothing was changed.
if not defined AR_DRY echo ARSENAL is removed. Your mod folders and the game were not touched.
(goto) 2>nul & del /f /q "%AR_SELF%" & cmd /d /c exit %AR_RC%

:un_relay
set "AR_FL="
if defined AR_DRY set "AR_FL=--dry"
if "%AR_CACHES%"=="yes" set "AR_FL=%AR_FL% --remove-caches"
if "%AR_CACHES%"=="no" set "AR_FL=%AR_FL% --keep-caches"
set "AR_T=%TEMP%\ARSENAL-uninstall-%RANDOM%%RANDOM%.cmd"
copy /y "%AR_SELF%" "%AR_T%" >nul 2>&1
if not exist "%AR_T%" echo ARSENAL uninstaller: cannot write a copy of itself into "%TEMP%". Nothing was removed. 1>&2 & exit /b 3
cd /d "%TEMP%"
"%AR_T%" --uninstall "%AR_DIR%" %AR_FL%

:un_link
if /i not "%AR_N:~-12%"=="\ARSENAL.lnk" goto :eof
if not exist "%AR_N%" goto :eof
if defined AR_DRY echo   dry   would remove the shortcut "%AR_N%" & goto :eof
del /f /q "%AR_N%" 2>nul
echo   ok    removed the shortcut "%AR_N%"
goto :eof

:un_item
if not defined AR_N goto :eof
if not "%AR_N:\=%"=="%AR_N%" goto :eof
if not "%AR_N:/=%"=="%AR_N%" goto :eof
if not "%AR_N::=%"=="%AR_N%" goto :eof
if not "%AR_N:..=%"=="%AR_N%" goto :eof
set "AR_P=%AR_DIR%\%AR_N%"
if not exist "%AR_P%" goto :eof
if defined AR_DRY echo   dry   would remove "%AR_P%" & goto :eof
if not exist "%AR_P%\" del /f /q "%AR_P%" 2>nul & goto :eof
dir /s /b /a-d "%AR_P%\mod.info" >nul 2>&1
if not errorlevel 1 echo   kept  "%AR_P%": a mod folder is inside it & goto :eof
rd /s /q "%AR_P%" 2>nul
goto :eof

:un_norec
echo ARSENAL uninstaller: "%AR_DIR%" has no %AR_REC%, so it was not made by Install-ARSENAL.cmd. Nothing was removed. 1>&2
exit /b 3

rem ---- stops
:ar_help
echo usage: Install-ARSENAL.cmd [--dir ^<folder^>] [--no-shortcuts] [--desktop] [--dry]
echo        Install-ARSENAL.cmd --uninstall ^<folder^> [--remove-caches ^| --keep-caches] [--dry]
echo   Installs ARSENAL for this Windows user (default folder %%LOCALAPPDATA%%\Programs\ARSENAL), no administrator rights.
echo   --dir: install there and ask nothing.  --dry: print every step, change nothing.
exit /b 0
:ar_usage
echo usage: Install-ARSENAL.cmd [--dir ^<folder^>] [--no-shortcuts] [--desktop] [--dry]   (--help for more) 1>&2
exit /b 2
:ar_oldwin
echo   no    system: this is Windows %AR_MAJ% (version "%AR_VER%"). ARSENAL needs Windows 10 or 11, 64-bit. Nothing was installed.
goto :ar_stop
:ar_32bit
echo   no    system: this is 32-bit Windows (%AR_ARCH%). ARSENAL needs 64-bit Windows 10 or 11. Nothing was installed.
goto :ar_stop
:ar_nopkg
echo   no    Install-ARSENAL.cmd must start from the unzipped download, next to ARSENAL.exe (or ARSENAL.cmd and the tools folder).
echo         Unzip the whole download first, then start it there. Nothing was installed.
goto :ar_stop
:ar_frominst
echo   no    this is an installed copy. To install again, start Install-ARSENAL.cmd from the unzipped download. Nothing was changed.
goto :ar_stop
:ar_nolad
echo   no    LOCALAPPDATA is not set, so there is no default folder. Give one with --dir. Nothing was installed.
goto :ar_stop
:ar_badfolder
echo   no    "%AR_DIR%" is a drive, not a folder. Pick a folder. Nothing was installed.
goto :ar_stop
:ar_samefolder
echo   no    the install folder is the download folder itself. Pick another one. Nothing was installed.
goto :ar_stop
:ar_gamefolder
echo   no    "%AR_DIR%" is inside a Steam game folder. ARSENAL never writes there; pick another folder. Nothing was installed.
goto :ar_stop
:ar_notdir
echo   no    "%AR_DIR%" is a file, not a folder. Nothing was installed.
goto :ar_stop
:ar_notempty
echo   no    "%AR_DIR%" already holds other files. Pick a new or empty folder (the uninstaller removes what it installs there).
echo         Nothing was installed.
goto :ar_stop
:ar_nowrite
echo   no    cannot make "%AR_DIR%". Pick a folder you can write to (no administrator rights are used). Nothing was installed.
goto :ar_stop
:ar_copyfail
echo   no    copying into "%AR_DIR%" failed. Check the disk space and that no file there is open, then start again.
goto :ar_stop
:ar_stop
if exist "%AR_TMPF%" del /f /q "%AR_TMPF%"
if defined AR_ASK pause
exit /b 3
