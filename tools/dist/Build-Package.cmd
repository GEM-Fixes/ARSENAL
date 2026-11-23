@echo off
rem Build-Package.cmd: one click builds only the ARSENAL package itself, no installer: ARSENAL-<ver>-small.zip, the window (GUI),
rem the tools, the launchers and the guide book. Unzip it anywhere and start ARSENAL.cmd (Windows) or ARSENAL.sh; the launcher
rem fetches its own pinned Node.js on first start. Needs Node.js on the build machine and nothing else (no Go).
rem Double-click it, or: tools\dist\Build-Package.cmd [any zip.js option, e.g. --ver 0.2.0]
rem The two data folders (guide index, historical sources) go in when Build-Installer.cmd has built them into
rem %ARSENAL_DIST_WORK%; where they are absent the package is built without them and one line says so.
rem Places, each settable before the call:
rem   ARSENAL_DIST_WORK  where the data folders and the book are built (default %ARSENAL_TMP%\dist-historical when ARSENAL_TMP is set, else tools\dist\out)
rem   ARSENAL_DIST_OUT   where the zip goes                            (default <checkout>\run\package)
rem Full steps and what each part is: tools\dist\README.md. Uploads nothing.
rem Author: Imperator_Aug (ARSENAL)
setlocal EnableExtensions DisableDelayedExpansion
set "HERE=%~dp0"
pushd "%HERE%..\.." || goto :fail
set "REST="
:rest
if not "%~1"=="" (set "REST=%REST% %1" & shift & goto :rest)

where node >nul 2>nul || (echo error: node is not on PATH. Install Node.js from https://nodejs.org to build. 1>&2 & goto :fail)
if not defined ARSENAL_DIST_WORK (
  set "ARSENAL_DIST_WORK=%CD%\tools\dist\out"
  if defined ARSENAL_TMP set "ARSENAL_DIST_WORK=%ARSENAL_TMP%\dist-historical"
)
if not defined ARSENAL_DIST_OUT set "ARSENAL_DIST_OUT=%CD%\..\run\package"
set "GEM=%ARSENAL_DIST_WORK%\gemindex"
set "WW2=%ARSENAL_DIST_WORK%\ww2sources"
set "BOOKS=%ARSENAL_DIST_WORK%\docgen"

set "GEMOPT=--no-gemindex"
if exist "%GEM%\guides.json" set "GEMOPT=--gemindex "%GEM%""
set "WW2OPT=--no-ww2sources"
if exist "%WW2%\ww2sources.json" set "WW2OPT=--ww2sources "%WW2%""
set "WSOPT="
if not exist "%CD%\third_party\workshop_gui\workshop_gui.exe" set "WSOPT= --no-workshop_gui"

echo == 1/2 public guide book ^(HTML and PDF^): %BOOKS%
if exist "%BOOKS%\" rmdir /s /q "%BOOKS%"
if exist tools\docgen\docgen.js (
  node tools\docgen\docgen.js --out "%BOOKS%" --no-internal --books > "%TEMP%\arsenal-build-package-books.log" 2>&1
) else (
  node guide\build-pdf.js --public --out "%BOOKS%\public\guide\dist" > "%TEMP%\arsenal-build-package-books.log" 2>&1
)
if errorlevel 1 (
  findstr /v /b /c:"SAMPLE " /c:"  before:" /c:"  after:" "%TEMP%\arsenal-build-package-books.log"
  echo error: the public books did not build. Full log: %TEMP%\arsenal-build-package-books.log 1>&2
  goto :fail
)

echo == 2/2 the package: %ARSENAL_DIST_OUT%
node tools\dist\zip.js --small --out-dir "%ARSENAL_DIST_OUT%" %GEMOPT% %WW2OPT%%WSOPT% --books-root "%BOOKS%\public"%REST%
if errorlevel 1 (echo error: the package was not built. The lines above that start with REFUSED say why. 1>&2 & goto :fail)
echo.
echo Done. The package and its .sha256 file are in %ARSENAL_DIST_OUT%
popd
if /i not "%ARSENAL_NO_PAUSE%"=="1" pause
exit /b 0

:fail
echo.
echo BUILD FAILED.
popd
if /i not "%ARSENAL_NO_PAUSE%"=="1" pause
exit /b 1
