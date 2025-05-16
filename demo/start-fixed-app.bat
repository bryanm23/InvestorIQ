@echo off
echo Starting the fixed application...

REM Create cache directory if it doesn't exist
if not exist cache mkdir cache
echo Cache directory ready.

REM Kill any existing PHP processes
taskkill /F /IM php.exe 2>nul
echo Cleaned up any existing PHP processes.

REM Start the PHP server in the background
start "PHP Server" cmd /c "php -S localhost:8080 -t ."
echo PHP server started on port 8080.

REM Wait a moment for the PHP server to initialize
timeout /t 2 /nobreak > nul

REM Start the React development server
echo Starting React development server...
start "React Dev Server" cmd /c "npm start"

echo.
echo Application started successfully!
echo.
echo Frontend: http://localhost:3000
echo Backend: http://localhost:8080
echo.
echo Press any key to stop all servers...
pause > nul

REM Kill servers when user presses a key
taskkill /F /IM php.exe 2>nul
taskkill /F /FI "WINDOWTITLE eq React Dev Server" 2>nul
taskkill /F /FI "WINDOWTITLE eq PHP Server" 2>nul

echo All servers stopped.
