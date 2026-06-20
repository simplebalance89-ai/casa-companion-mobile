import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import { useVoiceSocket, type VoiceState } from '@/hooks/useVoiceSocket';
import {
  getMessageCount,
  getSessionStart,
  incrementMessageCount,
  resetSessionStart,
  setSessionStart,
  isVoiceEnabled,
} from '@/lib/settings';

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseVoiceChatOptions {
  mode?: ModeConfig;
}

export interface UseVoiceChatReturn {
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

export function useVoiceChat(
  character: Character | null,
  options: UseVoiceChatOptions = {}
): UseVoiceChatReturn {
  const { mode } = options;
  const [messageCount, setMessageCount] = useState(() => getMessageCount());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(() =>
    Math.floor((Date.now() - getSessionStart()) / 1000)
  );

  const voiceEnabledRef = useRef(isVoiceEnabled());

  // Live session timer.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - getSessionStart()) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const onTurnStateChange = useCallback((state: VoiceState) => {
    if (state === 'speaking') {
      voiceEnabledRef.current = isVoiceEnabled();
    }
  }, []);

  const {
    voiceState,
    messages,
    lastTranscript,
    lastResponse,
    error,
    startListening,
    stopListening,
    sendTextMessage,
    interrupt,
    clearError,
  } = useVoiceSocket({ character, mode, onTurnStateChange });

  const toggleRecording = useCallback(() => {
    clearError();

    if (voiceState === 'listening') {
      stopListening();
      return;
    }

    // Barge-in: if the character is speaking, interrupt and start listening.
    if (voiceState === 'speaking') {
      interrupt();
    }

    void startListening();
  }, [voiceState, stopListening, interrupt, startListening, clearError]);

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      if (getMessageCount() === 0) {
        setSessionStart(Date.now());
      }

      incrementMessageCount(2);
      setMessageCount(getMessageCount());
      sendTextMessage(text.trim());
    },
    [sendTextMessage]
  );

  const reset = useCallback(() => {
    stopListening();
    clearError();
    resetSessionStart();
    setMessageCount(0);
  }, [stopListening, clearError]);

  // Increment message count when messages arrive.
  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      incrementMessageCount(messages.length - prevMessagesLengthRef.current);
      setMessageCount(getMessageCount());
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages]);

  return {
    turnState: voiceState,
    lastTranscript,
    lastResponse,
    errorMessage: error || '',
    messages,
    messageCount,
    sessionDurationSeconds,
    toggleRecording,
    reset,
    sendText,
    wakeListening: false,
  };
}
