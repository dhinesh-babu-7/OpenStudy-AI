import dotenv from 'dotenv'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) })

const app = express()
const port = Number.parseInt(process.env.PORT || '3000', 10)
const model = process.env.OPENROUTER_MODEL || 'openrouter/free'
const apiKey = process.env.OPENROUTER_API_KEY
const defaultStudyMode = 'simple-explanation'
const studyModeInstructions = Object.freeze({
  'simple-explanation': 'Explain the concept in beginner-friendly language. Define unfamiliar terms and use clear examples or analogies where helpful.',
  'exam-answer': 'Write a focused, exam-ready answer. Use an introduction, clearly organized key points, and a conclusion when appropriate to the question.',
  'step-by-step': 'Explain the solution in a logical sequence of numbered steps. Show the working and calculations when relevant, and explain what each step does.',
  'quick-summary': 'Give concise study notes containing only the most important facts and takeaways. Prefer brief bullets over extended explanation.',
})
const timeoutValue = Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS || process.env.HF_TIMEOUT_MS || '45000', 10)
const timeoutMs = Number.isInteger(timeoutValue) && timeoutValue >= 1000 && timeoutValue <= 120000
  ? timeoutValue
  : 45000
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

function sendError(response, status, code, message, requestId, details) {
  response.status(status).json({ error: { code, message, details, requestId } })
}

function sanitizeProviderDetails(payload, secret) {
  const detail = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.error?.message === 'string'
      ? payload.error.message
      : typeof payload?.message === 'string'
        ? payload.message
        : ''

  if (!detail) return undefined
  const sanitized = detail
    .replaceAll(secret, '[redacted]')
    .replace(/Bearer\s+[^\s"'`,}]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]{10,}\b/gi, '[redacted]')
    .replace(/\bhf_[A-Za-z0-9_-]{10,}\b/gi, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 320)

  return sanitized || undefined
}

app.disable('x-powered-by')
app.use((request, response, next) => {
  const origin = request.get('origin')
  if (origin && !allowedOrigins.has(origin)) {
    return sendError(response, 403, 'origin_not_allowed', 'This origin is not allowed to use the API.')
  }
  if (origin) {
    response.set('Access-Control-Allow-Origin', origin)
    response.vary('Origin')
  }
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})
app.use(express.json({ limit: '64kb' }))
app.use((request, response, next) => {
  request.requestId = randomUUID()
  next()
})

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok', inferenceConfigured: Boolean(apiKey), model })
})

app.post('/api/chat', async (request, response) => {
  const { question, history = [], mode = defaultStudyMode } = request.body ?? {}
  if (typeof question !== 'string' || !question.trim()) {
    return sendError(response, 400, 'invalid_question', 'Enter a question before asking.', request.requestId)
  }
  if (question.length > 2000) {
    return sendError(response, 400, 'question_too_long', 'Questions must be 2,000 characters or fewer.', request.requestId)
  }
  if (!Array.isArray(history) || history.length > 10 || history.some((item) => (
    !item || !['user', 'assistant'].includes(item.role) ||
    typeof item.content !== 'string' || item.content.length > 4000
  ))) {
    return sendError(response, 400, 'invalid_history', 'Conversation history is invalid or too long. Clear the conversation and try again.', request.requestId)
  }
  if (typeof mode !== 'string' || !Object.hasOwn(studyModeInstructions, mode)) {
    return sendError(response, 400, 'invalid_study_mode', 'Choose one of the available study modes and try again.', request.requestId)
  }
  if (!apiKey) {
    return sendError(response, 503, 'inference_not_configured', 'The backend has no OpenRouter API key configured. Add OPENROUTER_API_KEY to server/.env, then restart the backend.', request.requestId)
  }

  const messages = [
    {
      role: 'system',
      content: `You are OpenStudy AI, a patient study assistant. Be honest about uncertainty, do not invent sources, and remind learners to verify important facts. ${studyModeInstructions[mode]}`,
    },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: question.trim() },
  ]

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-OpenRouter-Title': 'OpenStudy AI',
      },
      body: JSON.stringify({ model, messages, max_tokens: 800, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!upstream.ok) {
      const status = upstream.status
      const rawBody = await upstream.text().catch(() => '')
      let providerPayload
      try {
        providerPayload = JSON.parse(rawBody)
      } catch {
        providerPayload = undefined
      }
      const details = sanitizeProviderDetails(providerPayload, apiKey)
      const knownErrors = {
        400: ['invalid_request', 'OpenRouter rejected the chat request. Check the messages and model configuration.'],
        401: ['invalid_api_key', 'OpenRouter rejected the API key. Check that OPENROUTER_API_KEY is valid and enabled.'],
        402: ['insufficient_credits', 'OpenRouter reports insufficient credits. Check your account limits and the selected model pricing.'],
        403: ['access_denied', 'OpenRouter denied this request. Check the key status, account limits, and model access.'],
        404: ['model_unavailable', `OpenRouter could not serve model "${model}". Check that it is still in the model catalog.`],
        422: ['unsupported_model_request', 'OpenRouter or the selected model rejected the request format or parameters.'],
        429: ['rate_limited', 'OpenRouter rate limits were reached. Wait briefly and retry.'],
        502: ['upstream_error', 'OpenRouter could not complete the request with an upstream model. Retry shortly.'],
        503: ['router_unavailable', model === 'openrouter/free'
          ? 'OpenRouter could not find an available free model for this request. Retry later or choose a currently listed :free model.'
          : `OpenRouter could not serve model "${model}" right now. Retry later or choose another available model.`],
      }
      const unavailableFreeRoute = model === 'openrouter/free' && [404, 503].includes(status)
      const [code, message] = unavailableFreeRoute
        ? ['free_models_unavailable', 'OpenRouter currently has no available free model for this request. Retry later or select a current :free model from the catalog.']
        : knownErrors[status] || (status >= 500
          ? ['openrouter_error', 'OpenRouter returned a server error. Retry shortly.']
          : ['openrouter_request_rejected', 'OpenRouter rejected the request. Check the model and request configuration.'])
      console.error(`[${request.requestId}] OpenRouter returned HTTP ${status} (${code}).${details ? ` Provider detail: ${details}` : ''}`)
      return sendError(response, status, code, message, request.requestId, details)
    }

    const rawBody = await upstream.text()
    let result
    try {
      result = JSON.parse(rawBody)
    } catch {
      console.error(`[${request.requestId}] OpenRouter returned HTTP ${upstream.status} with invalid JSON.`)
      return sendError(response, 502, 'malformed_provider_response', 'OpenRouter returned an invalid response. Please retry.', request.requestId)
    }
    const answer = result?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      const details = sanitizeProviderDetails(result, apiKey)
      console.error(`[${request.requestId}] OpenRouter returned HTTP ${upstream.status} without a text completion.${details ? ` Provider detail: ${details}` : ''}`)
      return sendError(response, 502, 'empty_model_response', 'The model returned no answer. Please try again.', request.requestId, details)
    }
    console.info(`[${request.requestId}] OpenRouter returned HTTP ${upstream.status}; chat completion succeeded.`)
    return response.json({ answer, model: result.model || model })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error(`[${request.requestId}] OpenRouter request timed out.`)
      return sendError(response, 504, 'openrouter_timeout', 'OpenRouter took too long to respond. Please retry.', request.requestId)
    }
    console.error(`[${request.requestId}] OpenRouter request failed (${error.name || 'unknown error'}).`)
    return sendError(response, 502, 'openrouter_network_error', 'Could not reach OpenRouter. Check the backend network and retry.', request.requestId)
  }
})

app.use('/api', (request, response) => {
  sendError(response, 404, 'not_found', 'API route not found.', request.requestId)
})

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (error.type === 'entity.too.large') {
    return sendError(response, 413, 'request_too_large', 'The request body is too large.', request.requestId)
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return sendError(response, 400, 'invalid_json', 'Request body must be valid JSON.', request.requestId)
  }
  console.error(`[${request.requestId || 'unknown'}] Unexpected backend error (${error.name || 'unknown error'}).`)
  return sendError(response, 500, 'internal_error', 'The backend could not complete this request.', request.requestId)
})

app.listen(port, () => {
  console.info(`OpenStudy AI backend listening on http://localhost:${port}`)
})