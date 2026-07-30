# ADR-0001 — Stack: Electron + React + TypeScript con Forge/Webpack

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** aplicación lectora completa

## Contexto

Vestigio necesita una app de escritorio Windows portable (carpeta en USB, sin instalación, sin admin), con lectores de PDF/EPUB/HTML embebidos, UI rica y acceso a SQLite nativo. Daniel no es programador: el stack debe ser el que la IA constructora y el ecosistema NODO dominan.

## Decisión

Electron + React + TypeScript estricto. Empaquetado con Electron Forge usando el plugin **Webpack estable** (no el de Vite mientras la documentación oficial lo considere experimental). Estado de UI local y explícito, sin frameworks globales innecesarios.

## Alternativas consideradas

- **Tauri:** más ligero, pero WebView2 depende del runtime del sistema (choca con "portable sin instalación previa") y el ecosistema Rust queda fuera de los patrones de NODO.
- **Aplicación web + servidor local:** rompe el modelo de un solo ejecutable portable y añade superficie de red.
- **Forge + Vite:** documentado como experimental; el plan lo veta explícitamente.

## Consecuencias

Paquete más pesado (runtime incluido, aceptado por diseño); a cambio, render idéntico en cualquier Windows, PDF.js de primera clase y un solo lenguaje en todo el repo.

## Evidencia

Requisitos §3 y §6.2 del plan; React+TS+SQLite ya probados en el ecosistema (Canon `patrones/stack`).
