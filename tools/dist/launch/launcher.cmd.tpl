@echo off
@@HEAD@@
setlocal EnableExtensions DisableDelayedExpansion
rem no program from the current folder: node, curl, tar and certutil come from PATH or System32 only
set "NoDefaultCurrentDirectoryInExePath=1"
set "AR_PKG=%~dp0"
set "AR_PKG=%AR_PKG:~0,-1%"
set "AR_GUI=@@GUI@@"
set "AR_V=@@NODE_VERSION@@"
set "AR_MIN=@@MIN_MAJOR@@"
set "AR_BASE=@@BASE@@"
set "AR_SYS32=%SystemRoot%\System32"
set "AR_NOARGS="
if [%1]==[] set "AR_NOARGS=1"
set "AR_STAGE="
set "AR_ROOT="

rem commands the single exe refuses or hides are refused here the same way (tools/dist/sea-main.js)
@@GATE@@

set "ARSENAL_VERSION=@@ARSENAL_VERSION@@"
if not defined GEM_INDEX_DIR if not defined GEMINDEX_DATA if exist "%AR_PKG%\gemindex\" set "GEM_INDEX_DIR=%AR_PKG%\gemindex"

rem a. ARSENAL_NODE
set "AR_NODE="
if not defined ARSENAL_NODE goto :ar_fetched
if not exist "%ARSENAL_NODE%" goto :ar_badenv
set "AR_NODE=%ARSENAL_NODE%"
goto :ar_run

rem b. a copy fetched before: in the package, else per user
:ar_fetched
if not exist "%AR_PKG%\node\%AR_V%\node.exe" goto :ar_user
set "AR_NODE=%AR_PKG%\node\%AR_V%\node.exe"
goto :ar_run
:ar_user
if not defined LOCALAPPDATA goto :ar_path
if not exist "%LOCALAPPDATA%\ARSENAL\node\%AR_V%\node.exe" goto :ar_path
set "AR_NODE=%LOCALAPPDATA%\ARSENAL\node\%AR_V%\node.exe"
goto :ar_run

rem c. node on PATH, major version at least AR_MIN
:ar_path
for /f "delims=" %%P in ('node -e "if(parseInt(process.versions.node,10)>=%AR_MIN%)console.log(process.execPath)" 2^>nul') do set "AR_NODE=%%P"
if defined AR_NODE goto :ar_run

rem d. fetch the pinned Node.js, check its sha256 before unpacking, move into place last
set "AR_ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "AR_ARCH=%PROCESSOR_ARCHITEW6432%"
set "AR_FILE="
if /i "%AR_ARCH%"=="AMD64" set "AR_FILE=@@WIN_X64_FILE@@"
if /i "%AR_ARCH%"=="AMD64" set "AR_SHA=@@WIN_X64_SHA@@"
if /i "%AR_ARCH%"=="ARM64" set "AR_FILE=@@WIN_ARM64_FILE@@"
if /i "%AR_ARCH%"=="ARM64" set "AR_SHA=@@WIN_ARM64_SHA@@"
if not defined AR_FILE goto :ar_nosys
set "AR_STEM=%AR_FILE:~0,-4%"
if not exist "%AR_SYS32%\curl.exe" goto :ar_notools
if not exist "%AR_SYS32%\tar.exe" goto :ar_notools
if not exist "%AR_SYS32%\certutil.exe" goto :ar_notools
set "AR_ROOT=%AR_PKG%\node"
if not exist "%AR_ROOT%\" mkdir "%AR_ROOT%" 2>nul
for /d %%D in ("%AR_ROOT%\.part-%AR_V%-*") do rd /s /q "%%D" 2>nul
set "AR_STAGE=%AR_ROOT%\.part-%AR_V%-%RANDOM%%RANDOM%"
mkdir "%AR_STAGE%" 2>nul && goto :ar_dl
rd "%AR_ROOT%" 2>nul
set "AR_STAGE="
if not defined LOCALAPPDATA goto :ar_nowrite
set "AR_ROOT=%LOCALAPPDATA%\ARSENAL\node"
if not exist "%AR_ROOT%\" mkdir "%AR_ROOT%" 2>nul
for /d %%D in ("%AR_ROOT%\.part-%AR_V%-*") do rd /s /q "%%D" 2>nul
set "AR_STAGE=%AR_ROOT%\.part-%AR_V%-%RANDOM%%RANDOM%"
mkdir "%AR_STAGE%" 2>nul && goto :ar_dl
set "AR_STAGE="
goto :ar_nowrite
:ar_dl
set "AR_DEST=%AR_ROOT%\%AR_V%"
echo ARSENAL: first start: downloading Node.js %AR_V% (%AR_FILE%) from %AR_BASE% into "%AR_DEST%" 1>&2
"%AR_SYS32%\curl.exe" -fL --proto @@PROTO@@ --proto-redir @@PROTO@@ --retry 2 --progress-bar -o "%AR_STAGE%\%AR_FILE%" "%AR_BASE%%AR_FILE%"
if errorlevel 1 goto :ar_dlfail
set "AR_GOT="
for /f "skip=1 delims=" %%H in ('%AR_SYS32%\certutil.exe -hashfile "%AR_STAGE%\%AR_FILE%" SHA256') do if not defined AR_GOT set "AR_GOT=%%H"
if defined AR_GOT set "AR_GOT=%AR_GOT: =%"
if /i not "%AR_GOT%"=="%AR_SHA%" goto :ar_badsum
"%AR_SYS32%\tar.exe" -xf "%AR_STAGE%\%AR_FILE%" -C "%AR_STAGE%" "%AR_STEM%/node.exe"
if errorlevel 1 goto :ar_unpackfail
if not exist "%AR_STAGE%\%AR_STEM%\node.exe" goto :ar_unpackfail
move /y "%AR_STAGE%\%AR_STEM%\node.exe" "%AR_STAGE%\node.exe" >nul
if errorlevel 1 goto :ar_unpackfail
rd /s /q "%AR_STAGE%\%AR_STEM%"
del /f /q "%AR_STAGE%\%AR_FILE%"
if exist "%AR_DEST%\node.exe" goto :ar_raced
if exist "%AR_DEST%\" rd /s /q "%AR_DEST%"
move "%AR_STAGE%" "%AR_DEST%" >nul
if errorlevel 1 goto :ar_unpackfail
:ar_placed
set "AR_STAGE="
set "AR_NODE=%AR_DEST%\node.exe"

rem e. run the tools
:ar_run
if "%AR_GUI%%AR_NOARGS%"=="11" goto :ar_rungui
"%AR_NODE%" "%AR_PKG%\tools\as2\as2.js" %*
exit /b %ERRORLEVEL%
:ar_rungui
"%AR_NODE%" "%AR_PKG%\tools\as2\as2.js" gui --open
exit /b %ERRORLEVEL%

:ar_raced
rd /s /q "%AR_STAGE%"
goto :ar_placed
:ar_badenv
echo ARSENAL: ARSENAL_NODE is set to "%ARSENAL_NODE%", which does not exist. Point it at a node.exe, or clear it. 1>&2
goto :ar_stop
:ar_nosys
echo ARSENAL: no Node.js download is pinned for this CPU (%AR_ARCH%). Install Node.js %AR_V% (or %AR_MIN% or newer) from https://nodejs.org and start again, or set ARSENAL_NODE to a node.exe. 1>&2
goto :ar_stop
:ar_notools
echo ARSENAL: curl.exe, tar.exe or certutil.exe is missing from "%AR_SYS32%" (Windows 10 1803 or newer has them). Install Node.js %AR_V% (or %AR_MIN% or newer) from https://nodejs.org and start again. 1>&2
goto :ar_stop
:ar_nowrite
echo ARSENAL: cannot write "%AR_PKG%\node" nor the per-user folder under LOCALAPPDATA. Install Node.js %AR_V% (or %AR_MIN% or newer) from https://nodejs.org and start again, or set ARSENAL_NODE. 1>&2
goto :ar_stop
:ar_dlfail
echo ARSENAL: the download of %AR_BASE%%AR_FILE% failed. Nothing was installed. Check the connection and start again, or install Node.js %AR_V% (or %AR_MIN% or newer) from https://nodejs.org. 1>&2
goto :ar_cleanstop
:ar_badsum
echo ARSENAL: checksum mismatch for %AR_FILE%: want sha256 %AR_SHA%, got %AR_GOT%. The file was deleted, nothing was installed. 1>&2
goto :ar_cleanstop
:ar_unpackfail
echo ARSENAL: unpacking node.exe from %AR_FILE% failed. Nothing was installed. 1>&2
goto :ar_cleanstop
:ar_cleanstop
if defined AR_STAGE if exist "%AR_STAGE%\" rd /s /q "%AR_STAGE%"
if defined AR_ROOT rd "%AR_ROOT%" 2>nul
:ar_stop
if "%AR_GUI%%AR_NOARGS%"=="11" pause
exit /b 3
@@REFUSALS@@
