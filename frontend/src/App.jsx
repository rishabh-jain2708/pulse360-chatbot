import { useState, useRef, useEffect } from 'react'
import SplashScreen from './components/SplashScreen'
import './index.css'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const SUGGESTIONS = [
    "What is Pulse 360?",
    "Key features of the platform",
    "How does it help advisors?",
    "Explain the pricing model"
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (!showSplash) {
      scrollToBottom()
    }
  }, [messages, showSplash])

  const sendQuery = async (queryText) => {
    if (!queryText.trim()) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: queryText }])
    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText })
      })
      
      const data = await response.json()
      
      setMessages(prev => [
        ...prev, 
        { role: 'bot', content: data.answer, source: data.source }
      ])
    } catch (error) {
      console.error(error)
      setMessages(prev => [
        ...prev, 
        { role: 'bot', content: 'Connection to the intelligence server failed.', source: 'System' }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = (e) => {
    e.preventDefault()
    sendQuery(input)
  }

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      {!showSplash && (
        <>
          {/* Background Aurora Elements */}
          <div className="aurora-bg">
            <div className="aurora-1"></div>
            <div className="aurora-2"></div>
          </div>

          <div className={`app-wrapper ${messages.length === 0 ? 'initial-state' : ''}`}>
            {messages.length === 0 && (
              <header className="header">
                <h1>Welcome to Pulse 360 Ecosystem</h1>
                <p>An intelligent assistant grounded in your documents, powered by advanced RAG. Ask a question to begin exploring the knowledge base.</p>
              </header>
            )}

            <div className="chat-area">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message-wrapper ${msg.role}`}>
                  <div className="message-bubble">
                    {msg.role === 'bot' && msg.source && (
                      <span className="source-tag">{msg.source}</span>
                    )}
                    <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="message-wrapper bot">
                  <div className="message-bubble">
                    <div className="loading-dots">
                      <div></div><div></div><div></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-section">
              {messages.length === 0 && (
                <div className="suggestions">
                  {SUGGESTIONS.map((text, idx) => (
                    <button 
                      key={idx} 
                      className="suggestion-chip"
                      onClick={() => sendQuery(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}

              <form className="input-bar" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder="Ask anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                />
                <button type="submit" className="send-btn" disabled={isLoading || !input.trim()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default App
