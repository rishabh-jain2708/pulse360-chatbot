import { useEffect, useRef, useState, useCallback } from 'react'
import './VoiceAssistant.css'

const WAKE_WORD = 'hey pulse'
const GREETING = "Yes Rishabh, what would you like to ask today?"

export default function VoiceAssistant({ onVoiceQuery, orbState, setOrbState }) {
  const [status, setStatus] = useState('idle') // idle | activated | listening | processing | speaking
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(true)

  const wakeRecognitionRef = useRef(null)
  const queryRecognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const isActivatedRef = useRef(false)

  // --- TEXT TO SPEECH ---
  const speak = useCallback((text, onEnd) => {
    synthRef.current.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.0
    utter.pitch = 1.0
    utter.volume = 1.0
    // Try to use a nice voice
    const voices = synthRef.current.getVoices()
    const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US English') || v.lang === 'en-US')
    if (preferred) utter.voice = preferred
    utter.onend = onEnd || null
    synthRef.current.speak(utter)
  }, [])

  // --- LISTEN FOR QUESTION ---
  const listenForQuestion = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    queryRecognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false

    setStatus('listening')
    setOrbState('listening')

    recognition.onresult = (e) => {
      const interim = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(interim)
      if (e.results[e.results.length - 1].isFinal) {
        const finalText = e.results[e.results.length - 1][0].transcript
        setTranscript(finalText)
        setStatus('processing')
        setOrbState('processing')
        onVoiceQuery(finalText, (answerText) => {
          setStatus('speaking')
          setOrbState('speaking')
          speak(answerText, () => {
            setStatus('idle')
            setOrbState('idle')
            isActivatedRef.current = false
            setTranscript('')
            startWakeWordListening()
          })
        })
      }
    }

    recognition.onerror = () => {
      setStatus('idle')
      setOrbState('idle')
      isActivatedRef.current = false
      startWakeWordListening()
    }

    recognition.onend = () => {
      if (status === 'listening') {
        setStatus('idle')
        setOrbState('idle')
        isActivatedRef.current = false
        startWakeWordListening()
      }
    }

    recognition.start()
  }, [onVoiceQuery, speak, setOrbState])

  // --- ACTIVATE VOICE ASSISTANT ---
  const activate = useCallback(() => {
    if (isActivatedRef.current) return
    isActivatedRef.current = true
    setStatus('activated')
    setOrbState('activated')
    
    if (wakeRecognitionRef.current) {
      wakeRecognitionRef.current.stop()
    }

    speak(GREETING, () => {
      listenForQuestion()
    })
  }, [speak, listenForQuestion, setOrbState])

  // --- WAKE WORD LISTENING ---
  const startWakeWordListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    wakeRecognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (e) => {
      const said = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('')
        .toLowerCase()
        .trim()

      if (said.includes(WAKE_WORD) || said.includes('hey pulse') || said.includes('a pulse')) {
        activate()
      }
    }

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') {
        // Auto-restart on error after short delay
        setTimeout(startWakeWordListening, 1000)
      }
    }

    recognition.onend = () => {
      if (!isActivatedRef.current) {
        // Auto-restart continuous listening
        setTimeout(startWakeWordListening, 500)
      }
    }

    try {
      recognition.start()
    } catch (e) {
      // Already started
    }
  }, [activate])

  useEffect(() => {
    startWakeWordListening()
    return () => {
      if (wakeRecognitionRef.current) wakeRecognitionRef.current.stop()
      if (queryRecognitionRef.current) queryRecognitionRef.current.stop()
      synthRef.current.cancel()
    }
  }, [])

  // --- MANUAL ACTIVATION BUTTON ---
  const handleMicClick = () => {
    if (status === 'idle') {
      activate()
    } else {
      // Cancel everything
      synthRef.current.cancel()
      if (queryRecognitionRef.current) queryRecognitionRef.current.stop()
      isActivatedRef.current = false
      setStatus('idle')
      setOrbState('idle')
      setTranscript('')
      startWakeWordListening()
    }
  }

  if (!supported) return null

  const statusLabels = {
    idle: 'Say "Hey Pulse" to activate',
    activated: 'Activated!',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Speaking...'
  }

  return (
    <div className={`voice-assistant ${status}`}>
      <button
        className={`mic-btn ${status !== 'idle' ? 'active' : ''}`}
        onClick={handleMicClick}
        title={status === 'idle' ? 'Click to activate voice' : 'Click to cancel'}
      >
        {status === 'idle' ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 9a1 1 0 0 1 1 1 8 8 0 0 1-7 7.93V23h-2v-2.07A8 8 0 0 1 4 13a1 1 0 1 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        )}
      </button>
      <span className="voice-status">{statusLabels[status]}</span>
      {transcript && (
        <span className="voice-transcript">"{transcript}"</span>
      )}
    </div>
  )
}
