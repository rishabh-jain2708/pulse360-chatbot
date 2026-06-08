import { useEffect, useRef, useState, useCallback } from 'react'
import './VoiceAssistant.css'

const WAKE_WORDS = ['hey pulse', 'hey puls', 'a pulse', 'pulse', 'hey polls', 'hey pals']
const GREETING = "Yes Rishabh, what would you like to ask today?"

// Get best Indian female voice
function getIndianVoice(voices) {
  // Priority order: Indian English female voices
  const priorities = [
    v => v.name === 'Veena',                              // macOS Indian English
    v => v.name.includes('Rishi'),                        // macOS Indian
    v => v.lang === 'en-IN' && v.name.toLowerCase().includes('female'),
    v => v.lang === 'en-IN',                              // Any Indian English
    v => v.name.includes('Google हिन्दी'),
    v => v.name.includes('Neerja'),                       // Microsoft Indian female
    v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'),
    v => v.name.includes('Google UK English Female'),
    v => v.lang === 'en-US' && v.name.includes('Samantha'),
    v => v.lang === 'en-US',
  ]
  for (const test of priorities) {
    const match = voices.find(test)
    if (match) return match
  }
  return voices[0]
}

export default function VoiceAssistant({ onVoiceQuery, orbState, setOrbState }) {
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const wakeRecognitionRef = useRef(null)
  const queryRecognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const isActivatedRef = useRef(false)
  const wakeRestartTimerRef = useRef(null)

  const setStateAll = (s) => {
    setStatus(s)
    setOrbState(s)
    setIsSpeaking(s === 'speaking')
  }

  // --- STOP EVERYTHING ---
  const stopAll = useCallback(() => {
    synthRef.current.cancel()
    if (queryRecognitionRef.current) {
      try { queryRecognitionRef.current.stop() } catch(e) {}
    }
    isActivatedRef.current = false
    setStateAll('idle')
    setTranscript('')
  }, [])

  // --- TEXT TO SPEECH (Indian Female) ---
  const speak = useCallback((text, onEnd) => {
    synthRef.current.cancel()

    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text)
      const voices = synthRef.current.getVoices()
      const voice = getIndianVoice(voices)
      if (voice) utter.voice = voice

      // Tune for more natural, warm Indian female tone
      utter.lang = voice?.lang || 'en-IN'
      utter.rate = 0.88   // slightly slower = more natural
      utter.pitch = 1.15  // slightly higher = female
      utter.volume = 1.0

      utter.onstart = () => setIsSpeaking(true)
      utter.onend = () => {
        setIsSpeaking(false)
        if (onEnd) onEnd()
      }
      utter.onerror = () => {
        setIsSpeaking(false)
        if (onEnd) onEnd()
      }

      synthRef.current.speak(utter)
    }

    // Voices may not be loaded yet
    if (synthRef.current.getVoices().length > 0) {
      doSpeak()
    } else {
      synthRef.current.onvoiceschanged = () => { doSpeak() }
    }
  }, [])

  // --- LISTEN FOR QUESTION ---
  const listenForQuestion = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    queryRecognitionRef.current = recognition
    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    setStateAll('listening')

    recognition.onresult = (e) => {
      const interim = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(interim)

      if (e.results[e.results.length - 1].isFinal) {
        const finalText = e.results[e.results.length - 1][0].transcript.trim()
        setTranscript(finalText)
        setStateAll('processing')

        onVoiceQuery(finalText, (answerText) => {
          setStateAll('speaking')
          speak(answerText, () => {
            setStateAll('idle')
            isActivatedRef.current = false
            setTranscript('')
            setTimeout(startWakeWordListening, 500)
          })
        })
      }
    }

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') {
        setStateAll('idle')
        isActivatedRef.current = false
        setTranscript('')
        setTimeout(startWakeWordListening, 500)
      }
    }

    recognition.onend = () => {
      // Only restart wake word if we're still in listening state (not moved to processing/speaking)
      if (status === 'listening') {
        setStateAll('idle')
        isActivatedRef.current = false
        setTimeout(startWakeWordListening, 500)
      }
    }

    recognition.start()
  }, [onVoiceQuery, speak])

  // --- ACTIVATE VOICE ASSISTANT ---
  const activate = useCallback(() => {
    if (isActivatedRef.current) return
    isActivatedRef.current = true
    setStateAll('activated')

    // Stop wake word listening
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop() } catch(e) {}
    }
    if (wakeRestartTimerRef.current) {
      clearTimeout(wakeRestartTimerRef.current)
    }

    speak(GREETING, () => {
      listenForQuestion()
    })
  }, [speak, listenForQuestion])

  // --- WAKE WORD LISTENING ---
  const startWakeWordListening = useCallback(() => {
    if (isActivatedRef.current) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }

    // Clean up previous
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop() } catch(e) {}
    }

    const recognition = new SpeechRecognition()
    wakeRecognitionRef.current = recognition
    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onresult = (e) => {
      if (isActivatedRef.current) return

      // Check all alternatives for the wake word
      for (let i = 0; i < e.results.length; i++) {
        for (let j = 0; j < e.results[i].length; j++) {
          const said = e.results[i][j].transcript.toLowerCase().trim()
          const isWake = WAKE_WORDS.some(w => said.includes(w))
          if (isWake) {
            activate()
            return
          }
        }
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'network') {
        // These are normal - just restart
        wakeRestartTimerRef.current = setTimeout(startWakeWordListening, 1000)
      }
    }

    recognition.onend = () => {
      if (!isActivatedRef.current) {
        wakeRestartTimerRef.current = setTimeout(startWakeWordListening, 300)
      }
    }

    try {
      recognition.start()
    } catch (e) {
      wakeRestartTimerRef.current = setTimeout(startWakeWordListening, 1000)
    }
  }, [activate])

  useEffect(() => {
    startWakeWordListening()
    return () => {
      if (wakeRecognitionRef.current) try { wakeRecognitionRef.current.stop() } catch(e) {}
      if (queryRecognitionRef.current) try { queryRecognitionRef.current.stop() } catch(e) {}
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current)
      synthRef.current.cancel()
    }
  }, [])

  const handleMicClick = () => {
    if (status === 'idle') {
      activate()
    } else {
      stopAll()
      setTimeout(startWakeWordListening, 600)
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
        className={`mic-btn ${status !== 'idle' ? 'active' : ''} ${isSpeaking ? 'speaking' : ''}`}
        onClick={handleMicClick}
        title={isSpeaking ? 'Click to stop speaking' : status === 'idle' ? 'Click to activate voice' : 'Click to cancel'}
      >
        {isSpeaking ? (
          /* Stop icon when speaking */
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        ) : status !== 'idle' ? (
          /* Cancel icon when active */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          /* Mic icon when idle */
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm7 9a1 1 0 0 1 1 1 8 8 0 0 1-7 7.93V23h-2v-2.07A8 8 0 0 1 4 13a1 1 0 1 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z"/>
          </svg>
        )}
      </button>

      <div className="voice-info">
        <span className="voice-status">{statusLabels[status]}</span>
        {transcript && (
          <span className="voice-transcript">"{transcript}"</span>
        )}
      </div>

      {isSpeaking && (
        <button className="stop-speaking-btn" onClick={stopAll}>
          ⏹ Stop
        </button>
      )}
    </div>
  )
}
