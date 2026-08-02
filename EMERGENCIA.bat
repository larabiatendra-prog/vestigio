@echo off
setlocal
REM EMERGENCIA: llegar a los documentos aunque Vestigio no arranque.
REM
REM Este fichero no depende de nada: ni de la aplicacion, ni de Node, ni de
REM PowerShell, ni de permisos de administrador, ni de Internet. Solo abre
REM el catalogo de respaldo con el navegador que tengas.

cd /d "%~dp0"
title Vestigio - Emergencia

REM La entrega es esta carpeta si lleva el marcador; en el repositorio de
REM desarrollo la entrega de pruebas vive mas adentro.
set "ENTREGA=%~dp0"
if not exist "%ENTREGA%VESTIGIO.portable" (
  if exist "%~dp0apps\reader\.portable-dev\VESTIGIO.portable" (
    set "ENTREGA=%~dp0apps\reader\.portable-dev\"
  )
)

if exist "%ENTREGA%FALLBACK\index.html" (
  echo.
  echo   Abriendo el catalogo de emergencia...
  echo.
  start "" "%ENTREGA%FALLBACK\index.html"
  exit /b 0
)

REM Sin catalogo de respaldo no se finge que hay una salida comoda.
echo.
echo   VESTIGIO - EMERGENCIA
echo   =====================
echo.
echo   No hay catalogo de respaldo en esta entrega, asi que no puedo darte
echo   una lista comoda de los documentos.
echo.
echo   Pero TUS DOCUMENTOS ESTAN BIEN. Vestigio nunca los modifica.
echo   Estan aqui:
echo.
echo       %ENTREGA%CONTENT\originals
echo.

if exist "%ENTREGA%CONTENT\originals" (
  echo   Voy a abrir esa carpeta. Los nombres son poco amables ^(son
  echo   identificadores^), pero los ficheros estan enteros.
  echo.
  start "" explorer "%ENTREGA%CONTENT\originals"
) else (
  echo   AVISO: tampoco existe esa carpeta. Esta entrega esta muy danada:
  echo   necesitas otra copia de la biblioteca.
  echo.
)

echo   Para saber que le pasa, ejecuta Doctor.bat
echo.
pause
