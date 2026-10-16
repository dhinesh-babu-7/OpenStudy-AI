
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const MAX_QUESTION_LENGTH = 2000
const STUDY_MODES = [
  {
    id: 'simple-explanation',
    label: 'Simple Explanation',
    description: 'Beginner-friendly language, with examples to make ideas clear.',
  },
  {
    id: 'exam-answer',
    label: 'Exam Answer',
    description: 'A structured answer with an introduction, key points, and a conclusion where useful.',
  },
  {
    id: 'step-by-step',
    label: 'Step-by-Step',
    description: 'Numbered steps, showing calculations when they help explain the solution.',
  },
  {
    id: 'quick-summary',
    label: 'Quick Summary',
    description: 'Concise notes focused on the most important facts.',
  },
]

function App() {
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState(STUDY_MODES[0].id)
  const [conversation, setConversation] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRequest, setLastRequest] = useState(null)
  const requestInFlight = useRef(false)

  async function ask(questionText, history = conversation, selectedMode = mode) {
    if (requestInFlight.current) return
    requestInFlight.current = true
    const request = { question: questionText, history: history.slice(-10), mode: selectedMode }
    setLastRequest(request)
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const isJsonResponse = response.headers.get('content-type')?.includes('application/json')
      const result = isJsonResponse ? await response.json().catch(() => null) : null

      if (!response.ok) {
        const backendError = result?.error
        const errorMessage = typeof backendError?.message === 'string' && backendError.message.trim()
          ? backendError.message
          : response.status >= 500
            ? `The backend could not complete this request (HTTP ${response.status}). Make sure the backend is running and check its terminal output.`
            : `The backend rejected this request (HTTP ${response.status}). Please try again.`
        const providerDetails = typeof backendError?.details === 'string'
          ? backendError.details.replace(/[\r\n\t]+/g, ' ').slice(0, 320).trim()
          : ''
        throw new Error(providerDetails ? `${errorMessage}\nProvider details: ${providerDetails}` : errorMessage)
      }
      if (!result) {
        throw new Error('The backend returned an invalid response. Please check its terminal output and try again.')
      }
      if (typeof result?.answer !== 'string' || !result.answer.trim()) {
        throw new Error('The model returned an empty answer. Please try again.')
      }

      setConversation([...request.history, { role: 'user', content: questionText }, { role: 'assistant', content: result.answer }])
      setQuestion('')
      setLastRequest(null)
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? 'Could not reach the OpenStudy AI backend. Check that the backend is running and try again.'
          : requestError.message,
      )
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || loading) return
    ask(trimmedQuestion)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function clearConversation() {
    setConversation([])
    setQuestion('')
    setError('')
    setLastRequest(null)
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="/" aria-label="OpenStudy AI home">
          <span className="brand-icon">✦</span>
          OpenStudy AI
        </a>
        <span className="open-badge">Open-model study partner</span>
      </header>

      <main className="hero">
        <div className="eyebrow">
          <span className="status-dot"></span>
          YOUR OPEN-MODEL STUDY PARTNER
        </div>

        <h1>
          Understand more.
          <br />
          <span>Learn without limits.</span>
        </h1>

        <p className="subtitle">
          Turn difficult concepts into simple explanations.
          Ask follow-up questions, explore ideas, and learn at your own pace.
        </p>

        {conversation.length > 0 && (
          <section className="conversation" aria-label="Study conversation" aria-live="polite">
            {conversation.map((message, index) => (
              <article className={`message message-${message.role}`} key={`${message.role}-${index}`}>
                <h2>{message.role === 'user' ? 'You asked' : 'OpenStudy AI'}</h2>
                {message.role === 'assistant' ? (
                  <div className="markdown-content"><ReactMarkdown>{message.content}</ReactMarkdown></div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            ))}
          </section>
        )}

        <section className="chat-card">
          <div className="card-heading">
            <div>
              <span className="sparkle">✦</span>
              <label htmlFor="question"><strong>What do you want to learn?</strong></label>
            </div>
            {conversation.length > 0 && (
              <button className="clear-button" type="button" onClick={clearConversation} disabled={loading}>
                Clear conversation
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="study-mode-field">
              <label htmlFor="study-mode">Study mode</label>
              <select
                id="study-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                disabled={loading}
                aria-describedby="study-mode-description"
              >
                {STUDY_MODES.map((studyMode) => (
                  <option key={studyMode.id} value={studyMode.id}>{studyMode.label}</option>
                ))}
              </select>
              <p id="study-mode-description">
                {STUDY_MODES.find((studyMode) => studyMode.id === mode)?.description}
              </p>
            </div>

            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything... e.g. Explain neural networks simply."
              rows={4}
              maxLength={MAX_QUESTION_LENGTH}
              aria-describedby="question-hint question-count"
              disabled={loading}
              required
            />

            <div className="input-footer">
              <span id="question-hint">Enter to ask · Shift+Enter for a new line</span>
              <span id="question-count" className="question-count">{question.length}/{MAX_QUESTION_LENGTH}</span>
              <button type="submit" disabled={!question.trim() || loading}>
                {loading ? <><span className="spinner" aria-hidden="true" /> Thinking</> : <>Ask AI <span aria-hidden="true">↗</span></>}
              </button>
            </div>
          </form>

          <p className="privacy-note">Your question is sent to OpenRouter and its selected model provider. AI answers can contain mistakes.</p>
        </section>

        {loading && <p className="loading-note" role="status">Working on your explanation...</p>}

        {error && (
          <div className="error-message" role="alert">
            <p>{error}</p>
            {lastRequest && (
              <button
                type="button"
                onClick={() => ask(lastRequest.question, lastRequest.history, lastRequest.mode)}
                disabled={loading}
              >
                Try again
              </button>
            )}
          </div>
        )}

        <div className="suggestions">
          <p>NEED AN IDEA? TRY ONE OF THESE</p>
          <div className="suggestion-list">
            {[
              'Explain quantum physics simply',
              'Help me learn Python',
              'How does machine learning work?',
            ].map((item) => (
              <button
                className="suggestion"
                key={item}
                onClick={() => setQuestion(item)}
              >
                {item} <span>↗</span>
              </button>
            ))}
          </div>
        </div>

        <footer>
          Open models, clearer learning · Answers are a starting point, not a source of truth.
        </footer>
      </main>
    </div>
  )
}

export default App
