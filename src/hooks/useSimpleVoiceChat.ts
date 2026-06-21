import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import {
  getMessageCount,
  getSessionStart,
  incrementMessageCount,
  setSessionStart,
} from '@/lib/settings';
import { useRecorder } from './useRecorder';
import { useTranscription } from './useTranscription';
import { useSpeech } from './useSpeech';

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseSimpleVoiceChatReturn {
  turnState: TurnState;
  lastTranscript: string;
  lastResponse: string;
  errorMessage: string;
  messages: ChatMessage[];
  messageCount: number;
  sessionDurationSeconds: number;
  toggleRecording: () => void;
  reset: () => void;
  sendText: (text: string) => Promise<void>;
  wakeListening: boolean;
}

export function useSimpleVoiceChat(
  character: Character | null,
  options: { mode?: ModeConfig } = {}
): UseSimpleVoiceChatReturn {
  const { mode } = options;

  const characterRef = useRef(character);
  const modeRef = useRef(mode);

  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const [turnState, setTurnState] = useState<TurnState>('idle');
  const turnStateRef = useRef(turnState);
  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCount, setMessageCount] = useState(() => getMessageCount());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(() =>
    Math.floor((Date.now() - getSessionStart()) / 1000)
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - getSessionStart()) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const appendUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    incrementMessageCount();
    setMessageCount(getMessageCount());
  }, []);

  const appendAssistantMessage = useCallback((text: string) => {
    setLastResponse(text);
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', text }];
      }
      return [...prev, { role: 'assistant', text }];
    });
    incrementMessageCount();
    setMessageCount(getMessageCount());
  }, []);

  const handleResponseText = useCallback(
    (text: string) => {
      appendAssistantMessage(text);
    },
    [appendAssistantMessage]
  );

  const handleComplete = useCallback(() => {
    setTurnState('idle');
  }, []);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setTurnState('error');
  }, []);

  const speech = useSpeech({
    characterRef,
    modeRef,
    onResponseText: handleResponseText,
    onComplete: handleComplete,
    onError: handleError,
  });

  const transcription = useTranscription();

  const handleRecordingStop = useCallback(
    async (blob: Blob, mimeType: string) => {
      setTurnState('processing');
      try {
        const transcript = await transcription.transcribeAudio(blob, mimeType);
        if (!transcript.trim()) {
          setTurnState('idle');
          return;
        }
        setLastTranscript(transcript);
        appendUserMessage(transcript);
        await speech.speak(transcript);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Transcription failed.');
        setTurnState('error');
      }
    },
    [transcription, speech, appendUserMessage]
  );

  const recorder = useRecorder({
    onStop: handleRecordingStop,
    onError: (message) => {
      setErrorMessage(message);
      setTurnState('error');
    },
  });

  const toggleRecording = useCallback(() => {
    if (turnStateRef.current === 'processing') return;

    setErrorMessage('');
    const state = turnStateRef.current;

    if (state === 'listening') {
      recorder.stopRecording();
      return;
    }

    if (state === 'speaking') {
      speech.stop();
    }

    if (getMessageCount() === 0) {
      setSessionStart(Date.now());
    }

    setLastTranscript('');
    setLastResponse('');
    setTurnState('listening');
    void recorder.startRecording();
  }, [recorder, speech]);

  const reset = useCallback(() => {
    speech.stop();
    recorder.stopRecording();
    setTurnState('idle');
    setLastTranscript('');
    setLastResponse('');
    setErrorMessage('');
    setMessages([]);
    setMessageCount(0);
    setSessionStart(Date.now());
  }, [speech, recorder]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (getMessageCount() === 0) {
        setSessionStart(Date.now());
      }

      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      incrementMessageCount();
      setMessageCount(getMessageCount());
      setLastTranscript(trimmed);
      setErrorMessage('');
      setTurnState('processing');

      await speech.speak(trimmed);
    },
    [speech]
  );

  return useMemo(
    () => ({
      turnState,
      lastTranscript,
      lastResponse,
      errorMessage,
      messages,
      messageCount,
      sessionDurationSeconds,
      toggleRecording,
      reset,
      sendText,
      wakeListening: false,
    }),
    [
      turnState,
      lastTranscript,
      lastResponse,
      errorMessage,
      messages,
      messageCount,
      sessionDurationSeconds,
      toggleRecording,
      reset,
      sendText,
    ]
  );
}
