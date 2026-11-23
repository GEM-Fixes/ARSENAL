@echo off
rem Build-Historical.cmd: the old name. The distribution is now ARSENAL Setup (no Node.js and no historical index packaged):
rem this file hands over to Build-Installer.cmd beside it. ARSENAL.exe with Node.js inside is no longer built for release.
rem Author: Imperator_Aug (ARSENAL)
call "%~dp0Build-Installer.cmd" %*
exit /b %ERRORLEVEL%
