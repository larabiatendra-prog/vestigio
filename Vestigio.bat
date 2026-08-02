@echo off
REM Vestigio: el conocimiento que permanece. Doble clic y a leer.
REM
REM Este lanzador arranca Vestigio con el Electron FIRMADO que viene con el
REM proyecto. Es un rodeo deliberado: el ejecutable empaquetado
REM (apps\reader\out\...\Vestigio.exe) lleva grabados los fusibles de
REM seguridad, y grabarlos rompe la firma digital de Electron, asi que el
REM Control de aplicaciones de Windows 11 lo bloquea en NODO. Hasta que se
REM resuelva la firma (docs\TOOLCHAIN.md), esta es la via que funciona.
REM
REM Tarda unos segundos la primera vez de cada sesion porque compila la
REM interfaz. A cambio, siempre abre la version actual del codigo: nunca te
REM da un Vestigio viejo por tener un paquete sin reconstruir.

cd /d "%~dp0"
title Vestigio

if not exist "node_modules\.package-lock.json" (
  echo.
  echo   Faltan las dependencias. Se instalan una sola vez y tarda un rato.
  echo.
  call npm ci
  if errorlevel 1 (
    echo.
    echo   No se pudieron instalar las dependencias. Revisa la conexion.
    pause
    exit /b 1
  )
)

echo.
echo   VESTIGIO
echo   El conocimiento que permanece
echo.
echo   Abriendo la biblioteca... esta ventana se cierra sola.
echo.

REM Sin herramientas de desarrollo: esto es para leer, no para depurar.
set VESTIGIO_SIN_DEVTOOLS=1

cd apps\reader
call npm start

if errorlevel 1 (
  echo.
  echo   Vestigio no ha podido arrancar. El detalle esta en:
  echo   apps\reader\.portable-dev\LOGS\vestigio.log
  echo.
  pause
)
