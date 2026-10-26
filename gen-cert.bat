
@echo off
cd /d "%~dp0"

where mkcert >nul 2>&1 || (
    echo ERROR: mkcert not found.
    pause
    exit /b 1
)

if not exist certs mkdir certs

for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 | Get-NetIPAddress -AddressFamily IPv4).IPAddress"') do set "IP=%%I"

if not defined IP (
    echo ERROR: Could not detect IP address.
    pause
    exit /b 1
)

mkcert -install || goto error
mkcert -cert-file certs\asistencia.pem -key-file certs\asistencia-key.pem "%IP%" localhost 127.0.0.1 || goto error

for /f "delims=" %%I in ('mkcert -CAROOT') do set "CA=%%I"
copy /Y "%CA%\rootCA.pem" certs\rootCA.pem >nul || goto error

echo.
echo Ready! Server IP: %IP%
echo Certificate files saved in certs\
pause
exit /b 0

:error
echo.
echo Something went wrong. Check the error above.
pause
exit /b 1
