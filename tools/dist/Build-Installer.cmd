@echo off
rem Build-Installer.cmd: one click builds ARSENAL Setup, the installer for Windows, Linux and macOS (tools\installer):
rem six files ARSENAL-Setup-<ver>-<system>, each carrying the small ARSENAL package (tools, launchers, gemindex, the public
rem guide book, the WW2 source lists). No Node.js is packaged: the installer sets Node.js up on the user's computer. The
rem historical index (ww2sources\index.sqlite, the document database) is NOT packaged either: the installer downloads it
rem from the link in tools\installer\config.json. This build prints the file to upload, its sha256 and its size.
rem Double-click it, or: tools\dist\Build-Installer.cmd [fresh] [plain] [any zip.js option, e.g. --ver 0.2.0]
rem   fresh: rebuild the gemindex and ww2sources folders even when they are already there (else they are reused).
rem   plain: build without the two data folders (no guide index, no historical sources): the tools, the window, the launchers
rem          and the guide book only. Needs neither ARSENAL_WW2_FROM nor ARSENAL_GEM_FROM. Full steps: tools\dist\README.md
rem Reads (never writes): the GEM External Index toolkit folder and the WW2 sources folder. Uploads nothing.
rem Places, each settable before the call:
rem   ARSENAL_WW2_FROM   the WW2 sources folder                (required)
rem   ARSENAL_GEM_FROM   the GEM External Index toolkit folder  (default: the toolkit on the Desktop)
rem   ARSENAL_DIST_WORK  where the data folders are built       (default %ARSENAL_TMP%\dist-historical when ARSENAL_TMP is set, else tools\dist\out)
rem   ARSENAL_DIST_OUT   where the installers go                (default <checkout>\run\installer)
rem   ARSENAL_GO         the Go program that compiles the installer (default: go on PATH)
rem The build machine needs Node.js and Go; the user's computer needs neither.
rem Author: Imperator_Aug (ARSENAL)
setlocal EnableExtensions DisableDelayedExpansion
set "HERE=%~dp0"
pushd "%HERE%..\.." || goto :fail
set "FRESH="
set "PLAIN="
:words
if /i "%~1"=="fresh" (set "FRESH=1" & shift & goto :words)
if /i "%~1"=="plain" (set "PLAIN=1" & shift & goto :words)
set "REST="
:rest
if not "%~1"=="" (set "REST=%REST% %1" & shift & goto :rest)

where node >nul 2>nul || (echo error: node is not on PATH. Install Node.js from https://nodejs.org to build. 1>&2 & goto :fail)

if not defined PLAIN if not defined ARSENAL_WW2_FROM (echo error: set ARSENAL_WW2_FROM to the WW2 sources folder, or add the word plain to build without the data folders. 1>&2 & goto :fail)
if not defined ARSENAL_GEM_FROM (
  set "ARSENAL_GEM_FROM=%USERPROFILE%\Desktop\GEM_External_Index_and_Scrape_Toolkit\GEM External Index and Scraper Toolkit"
  if exist "%USERPROFILE%\OneDrive\Desktop\GEM_External_Index_and_Scrape_Toolkit\GEM External Index and Scraper Toolkit\" set "ARSENAL_GEM_FROM=%USERPROFILE%\OneDrive\Desktop\GEM_External_Index_and_Scrape_Toolkit\GEM External Index and Scraper Toolkit"
)
if not defined ARSENAL_DIST_WORK (
  set "ARSENAL_DIST_WORK=%CD%\tools\dist\out"
  if defined ARSENAL_TMP set "ARSENAL_DIST_WORK=%ARSENAL_TMP%\dist-historical"
)
if not defined ARSENAL_DIST_OUT set "ARSENAL_DIST_OUT=%CD%\..\run\installer"
if not defined ARSENAL_GO (
  where go >nul 2>nul || (echo error: Go is not on PATH. Install Go or set ARSENAL_GO to go.exe. 1>&2 & goto :fail)
)
set "GEM=%ARSENAL_DIST_WORK%\gemindex"
set "WW2=%ARSENAL_DIST_WORK%\ww2sources"
set "BOOKS=%ARSENAL_DIST_WORK%\docgen"
set "INSTWORK=%ARSENAL_DIST_WORK%\installer"

set "DATAOPT=--gemindex "%GEM%" --ww2sources "%WW2%""
if defined PLAIN set "DATAOPT=--no-gemindex --no-ww2sources"
rem the Workshop uploader program is a separate download; where its folder is absent the package is built without it
set "WSOPT="
if not exist "%CD%\third_party\workshop_gui\workshop_gui.exe" set "WSOPT= --no-workshop_gui"
if defined PLAIN (echo == 1/4 and 2/4 left out ^(plain^): no gemindex folder, no ww2sources folder & goto :books)

echo == 1/4 gemindex folder: %GEM%
if defined FRESH if exist "%GEM%\" rmdir /s /q "%GEM%"
if exist "%GEM%\guides.json" (echo    reused ^(run with "fresh" to rebuild^)) else (
  if not exist "%ARSENAL_GEM_FROM%\" (echo error: the GEM External Index toolkit folder is not at "%ARSENAL_GEM_FROM%". Set ARSENAL_GEM_FROM. 1>&2 & goto :fail)
  node tools\gemindex\gemindex.js bundle --from "%ARSENAL_GEM_FROM%" --out "%GEM%" || goto :fail
)

echo == 2/4 ww2sources folder with the database: %WW2%
if defined FRESH if exist "%WW2%\" rmdir /s /q "%WW2%"
if exist "%WW2%\index.sqlite" (echo    reused ^(run with "fresh" to rebuild^)) else (
  if not exist "%ARSENAL_WW2_FROM%\" (echo error: the WW2 sources folder is not at "%ARSENAL_WW2_FROM%". Set ARSENAL_WW2_FROM. 1>&2 & goto :fail)
  node tools\gemindex\gemindex.js ww2bundle --from "%ARSENAL_WW2_FROM%" --out "%WW2%" || goto :fail
)

:books
echo == 3/4 public guide book ^(HTML and PDF^): %BOOKS%
rem always rebuilt (under a minute): the guide pages change between builds
if exist "%BOOKS%\" rmdir /s /q "%BOOKS%"
rem two ways to the same book: the edition builder where this tree has it, else the guide's own book builder (the pages of a
rem public tree are the public edition already)
if exist tools\docgen\docgen.js (
  node tools\docgen\docgen.js --out "%BOOKS%" --no-internal --books > "%TEMP%\arsenal-build-installer-books.log" 2>&1
) else (
  node guide\build-pdf.js --public --out "%BOOKS%\public\guide\dist" > "%TEMP%\arsenal-build-installer-books.log" 2>&1
)
if errorlevel 1 (
  findstr /v /b /c:"SAMPLE " /c:"  before:" /c:"  after:" "%TEMP%\arsenal-build-installer-books.log"
  echo error: the public books did not build. Full log: %TEMP%\arsenal-build-installer-books.log 1>&2
  goto :fail
)

echo == 4/4 the installers ^(built in %INSTWORK%^): %ARSENAL_DIST_OUT%
rem the small package only: no ARSENAL.exe, no Node.js, no index.sqlite (tools\installer\build.js refuses a payload that has one)
node tools\installer\build.js --out "%ARSENAL_DIST_OUT%" --work "%INSTWORK%" -- %DATAOPT%%WSOPT% --books-root "%BOOKS%\public"%REST% > "%TEMP%\arsenal-build-installer.log" 2>&1
set "RC=%ERRORLEVEL%"
type "%TEMP%\arsenal-build-installer.log"
if not "%RC%"=="0" (echo error: the installer build ended with %RC%. Full log: %TEMP%\arsenal-build-installer.log 1>&2 & goto :fail)
echo.
echo Done. The installers and their .sha256 files are in %ARSENAL_DIST_OUT%
if defined PLAIN (echo Built plain: no guide index and no historical sources inside. & goto :end)
echo The historical index is not inside them. Upload the file below, then put its link, sha256 and size into
echo tools\installer\config.json and build again:
node tools\installer\build.js --describe "%WW2%\index.sqlite"
:end
popd
if /i not "%ARSENAL_NO_PAUSE%"=="1" pause
exit /b 0

:fail
echo.
echo BUILD FAILED.
popd
if /i not "%ARSENAL_NO_PAUSE%"=="1" pause
exit /b 1
