# TierMax / OpenClaw Gateway — Modernization & Enhancements

## Resumen Ejecutivo

Este documento detalla las capacidades arquitectónicas incorporadas a **TierMax / OpenClaw Gateway**, inspiradas en las mejores prácticas de sistemas distribuidos y gateways multi-proveedor (`freellmapi`), preservando al 100% la compatibilidad hacia atrás con el esquema de base de datos de Supabase existente y los endpoints previos.

---

## 1. Adaptador Nativo del Protocolo Anthropic (`POST /v1/messages`)

El gateway ahora incluye un traductor bidireccional nativo del protocolo Anthropic Wire Format, permitiendo que herramientas de vanguardia como **Claude Code CLI**, `@anthropic-ai/sdk`, **Aider**, **Cursor**, y librerías compatibles consuman cualquier modelo subyacente (Groq, Nvidia NIM, DeepSeek, Google, OpenAI, etc.) utilizando sus credenciales virtuales de gateway (`gk_...`).

### Autenticación Flexible
El middleware `backend/src/middleware/gatewayAuth.ts` soporta:
- Encabezado nativo de Anthropic: `x-api-key: gk_...`
- Encabezado alternativo: `anthropic-api-key: gk_...`
- Encabezado estándar Bearer: `Authorization: Bearer gk_...`
- En caso de credenciales inválidas o faltantes en `/v1/messages`, el gateway devuelve errores con la estructura oficial de Anthropic (`type: "error", error: { type: "authentication_error", ... }`).

### Configuración con Claude Code CLI
Para utilizar TierMax con Claude Code, basta con definir las siguientes variables de entorno en su terminal:

```bash
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="gk_9621b3ab4448f84a727b42bfea651ccf"

# Iniciar Claude Code
claude
```

Si su herramienta concatena automáticamente `/v1`:
```bash
export ANTHROPIC_BASE_URL="http://localhost:3000/v1"
```
*(El gateway incluye alias automáticos para `/v1/messages`, `/messages` y `/v1/v1/messages`).*

### Formato de Respuestas y Streaming SSE
- **Modo JSON:** Transforma peticiones con `system`, `messages: [{role, content}]`, y `max_tokens` a OpenAI format, y traduce la respuesta a formato Anthropic oficial con `id: "msg_..."`, `type: "message"`, `role: "assistant"`, `content: [{"type": "text", "text": "..."}]`, `stop_reason: "end_turn"`, y `usage`.
- **Modo Streaming (SSE):** `AnthropicSSETransformer` convierte el flujo SSE de OpenAI en la máquina de estados estricta de Anthropic:
  1. `event: message_start`
  2. `event: content_block_start`
  3. `event: content_block_delta` (con deltas de texto token a token)
  4. `event: content_block_stop`
  5. `event: message_delta` (con conteo de tokens y `stop_reason`)
  6. `event: message_stop`

---

## 2. Endpoint Virtual Multi-Modelo `fusion`

El modelo virtual `fusion` (`model: "fusion"` o `"openclaw/fusion"`) implementa un pipeline dialéctico inspirado en sistemas de consenso distribuido:

1. **Selección de Panel Diverso:** Selecciona 3 modelos heterogéneos activos asignados a la llave del gateway (ej. Qwen 2.5, DeepSeek R1, Llama 3.3).
2. **Generación Paralela de Borradores:** Despacha la consulta del usuario en paralelo a los 3 panelistas con control de timeout por latencia.
3. **Síntesis Dialéctica con Juez:** Un modelo juez compara los argumentos, detecta inconsistencias o alucinaciones entre los borradores y redacta una respuesta definitiva, rigurosa y unificada.
4. **Telemetría Transparente:** La respuesta incluye metadatos enriquecidos en `_openclaw_fusion`:
   - `panel_models`: lista de modelos consultados.
   - `successful_drafts`: cantidad de borradores exitosos.
   - `judge_model`: modelo que realizó la síntesis dialéctica.
   - `total_latency_ms`: tiempo total invertido.
   - `draft_details`: latencias individuales y estado de cada borrador.
5. **Doble Compatibilidad:** Disponible tanto en `POST /v1/chat/completions` (OpenAI format) como en `POST /v1/messages` (Anthropic format, tanto JSON como SSE).

---

## 3. Catálogo Ampliado de Proveedores y Modelos

Se agregaron modelos de vanguardia y optimizaciones específicas:
- **Groq:** `qwen/qwen3.8-27b`, `deepseek-r1-distill-llama-70b`, `llama-3.3-70b-versatile`.
- **NVIDIA NIM:** `moonshotai/kimi-k3`, `minimaxai/minimax-m3`, `meta/llama-3.3-70b-instruct`.
- **DeepSeek Direct:** `deepseek-chat`, `deepseek-coder`, `deepseek-reasoner`.
- **Frontend UI (`frontend/`):**
  - Nuevos chips y badges con estilos específicos: `.provider-minimax` (fucsia/violeta) y `.provider-moonshot` (turquesa/teal).
  - Selectores desplegables actualizados en el panel de proyectos para vincular llaves y modelos de Moonshot AI y MiniMax AI sin fricción.

---

## 4. Verificación y Pruebas en Vivo

Todas las funcionalidades fueron verificadas en vivo contra el servidor activo en el puerto 3000 con llaves reales de gateway:
1. `POST /v1/chat/completions` (Groq/Qwen 2.5) -> **200 OK** (~10ms)
2. `POST /v1/messages` (JSON Anthropic Wire Protocol) -> **200 OK**
3. `POST /v1/messages` (SSE Streaming con eventos nativos Anthropic) -> **200 OK**
4. `POST /v1/chat/completions` con `model: "fusion"` -> **200 OK** (Consenso y síntesis completados)
5. `POST /v1/messages` con `model: "fusion"` (JSON) -> **200 OK**
6. `POST /v1/messages` con `model: "fusion"` (SSE Streaming) -> **200 OK**
7. `npm run build` en backend (`tsc`) -> **0 errores**
8. `npm run build` en frontend (`tsc -b && vite build`) -> **0 errores**
