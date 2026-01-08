@echo off
echo ============================================
echo   BACKUP SCRIPT - VS CODE + CHROME
echo ============================================

:: Set backup destination on SSD
set backupPath=G:\Backup

:: Create backup folder if not exists
if not exist "%backupPath%" (
    mkdir "%backupPath%"
)

echo.
echo Backing up VS Code...
set vscodeSource=C:\Users\%USERNAME%\AppData\Roaming\Code
set vscodeDest=%backupPath%\VSCode

if exist "%vscodeSource%" (
    robocopy "%vscodeSource%" "%vscodeDest%" /e
    echo ✔ VS Code backup complete.
) else (
    echo ⚠ VS Code folder not found.
)

echo.
echo Backing up Google Chrome...
set chromeSource=C:\Users\%USERNAME%\AppData\Local\Google\Chrome
set chromeDest=%backupPath%\Chrome

if exist "%chromeSource%" (
    robocopy "%chromeSource%" "%chromeDest%" /e
    echo ✔ Chrome backup complete.
) else (
    echo ⚠ Chrome folder not found.
)

echo.
echo ============================================
echo        Backup Completed Successfully
echo  VS Code and Chrome data saved to: %backupPath%
echo ============================================
pause
