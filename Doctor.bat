@echo off
setlocal
REM Doctor: revisa la entrega y dice que le pasa, en claro.
REM
REM Dos niveles, en orden de independencia:
REM
REM   1. Comprobaciones minimas de CMD, que funcionan siempre. Miran que la
REM      carpeta tenga lo imprescindible. NO validan integridad: si solo se
REM      llega hasta aqui, se dice, en vez de dar falsa tranquilidad.
REM   2. El Doctor completo, que necesita Node. Comprueba huellas, bases de
REM      datos, colecciones y copias.
REM
REM Uso:  Doctor.bat            revision rapida
REM       Doctor.bat --completo revision a fondo (tarda mas)

cd /d "%~dp0"
title Vestigio - Doctor

REM La entrega es esta carpeta si lleva el marcador; en el repositorio de
REM desarrollo la entrega de pruebas vive mas adentro.
set "ENTREGA=%~dp0"
if not exist "%ENTREGA%VESTIGIO.portable" (
  if exist "%~dp0apps\reader\.portable-dev\VESTIGIO.portable" (
    set "ENTREGA=%~dp0apps\reader\.portable-dev\"
  )
)

echo.
echo   DOCTOR DE VESTIGIO
echo   ==================
echo.
echo   Entrega: %ENTREGA%
echo.

REM --- Nivel 1: lo que se puede comprobar sin nada instalado ---------------

set FALTA_ALGO=0

if exist "%ENTREGA%VESTIGIO.portable" (
  echo   [ OK    ] Es una entrega de Vestigio
) else (
  echo   [ FALLO ] Falta VESTIGIO.portable: esta carpeta no es una entrega
  set FALTA_ALGO=1
)

if exist "%ENTREGA%CONTENT" (
  echo   [ OK    ] Carpeta CONTENT presente
) else (
  echo   [ FALLO ] Falta CONTENT: aqui viven los documentos y el catalogo
  set FALTA_ALGO=1
)

if exist "%ENTREGA%CONTENT\index\vestigio-content.sqlite" (
  echo   [ OK    ] El catalogo existe
) else (
  echo   [ FALLO ] Falta el catalogo
  set FALTA_ALGO=1
)

if exist "%ENTREGA%FALLBACK\index.html" (
  echo   [ OK    ] Hay salida de emergencia ^(EMERGENCIA.bat^)
) else (
  echo   [ AVISO ] Sin salida de emergencia: falta FALLBACK\index.html
)

echo.

if "%FALTA_ALGO%"=="1" (
  echo   Faltan piezas imprescindibles. Prueba EMERGENCIA.bat para llegar a
  echo   los documentos, y lee FALLBACK\RECUPERACION.txt si esta.
  echo.
)

REM --- Nivel 2: el Doctor de verdad ----------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo   ------------------------------------------------------------------
  echo   Hasta aqui llegan las comprobaciones basicas.
  echo.
  echo   NO se ha comprobado la integridad de los documentos ni la salud de
  echo   las bases de datos: para eso hace falta Node, que no esta en este
  echo   equipo. Que lo de arriba salga bien NO significa que la entrega
  echo   este intacta.
  echo   ------------------------------------------------------------------
  echo.
  pause
  exit /b 2
)

REM Al pasar la ruta como argumento hay que quitarle la barra final: en
REM Windows, "C:\ruta\" hace que la barra escape la comilla de cierre y el
REM argumento llega con una comilla pegada. Solo se ve probandolo de verdad.
set "ENTREGA_ARG=%ENTREGA:~0,-1%"

echo   Revisando a fondo. Esto puede tardar un poco...
echo.

call npm run --silent -w @vestigio/admin-cli admin -- doctor "%ENTREGA_ARG%" %*
set RESULTADO=%errorlevel%

echo.
if "%RESULTADO%"=="0" echo   Veredicto: la entrega esta operativa.
if "%RESULTADO%"=="1" echo   Veredicto: funciona a medias. Lee los remedios de arriba.
if "%RESULTADO%"=="3" (
  echo   Veredicto: esta entrega necesita otra copia.
  echo   Mientras tanto, EMERGENCIA.bat te lleva a los documentos.
)
echo.
echo   El informe queda guardado en LOGS\doctor.txt
echo.
pause
exit /b %RESULTADO%
