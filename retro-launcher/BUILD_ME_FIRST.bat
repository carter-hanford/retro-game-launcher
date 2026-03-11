@echo off
title RetroLauncher - First Time Setup
color 0B

echo.
echo  =============================================
echo    RETROLAUNCHER - First Time Setup
echo  =============================================
echo.
echo  This will install dependencies and build
echo  your RetroLauncher.exe — takes 2-5 minutes.
echo.
pause

:: Check Node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please install it from https://nodejs.org
    echo  Download the LTS version, run the installer,
    echo  then run this script again.
    echo.
    pause
    exit /b 1
)

echo.
echo  [1/3] Installing dependencies...
echo.
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: npm install failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo  [2/3] Building RetroLauncher.exe...
echo.
call npm run build-portable
if %errorlevel% neq 0 (
    echo.
    echo  Portable build failed, trying full installer build...
    call npm run build
)

echo.
echo  [3/3] Done! Looking for your .exe...
echo.

:: Find the exe and copy to desktop
for /r "dist" %%f in (*.exe) do (
    echo  Found: %%f
    copy "%%f" "%USERPROFILE%\Desktop\RetroLauncher.exe" >nul
    echo.
    echo  =============================================
    echo   SUCCESS! RetroLauncher.exe is now on your
    echo   Desktop. You can double-click it anytime!
    echo  =============================================
    echo.
    goto :done
)

echo.
echo  Build succeeded but could not find .exe automatically.
echo  Check the "dist" folder inside the RetroLauncher folder.
echo.

:done
pause
