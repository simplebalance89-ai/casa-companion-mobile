import { useState, useCallback, useRef, useEffect } from 'react';
import type { Character, ModeConfig } from '@/types';

const VOICE_SERVER_URL =
  (import.meta as Record<string, any>).env.VITE_VOICE_SERVER_URL ||
  'wss://casa-voice-agent.fly.dev/ws/voice';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseVoiceSocketOptions {
  character: Character | null;
  mode?: ModeConfig;
  onTurnStateChange?: (state: VoiceState) => void;
}

export interface UseVoiceSocketReturn {
  voiceState: VoiceState;
  messages: ChatMessage[];
  lastTranscript: string;
  lastResponse: string;
  error: string | null;
  isConnected: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  sendTextMessage: (text: string) => void;
  interrupt: () => void;
  clearError: () => void;
}

interface CharacterVoiceConfig {
  voice?: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
  lang: string;
}

function getVoiceForCharacter(_character: Character | null): CharacterVoiceConfig {
  const voices = window.speechSynthesis?.getVoices() || [];
  const preferred =
    voices.find((v) => v.lang.startsWith('en-US') && v.name.includes('Google')) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0];
  return {
    voice: preferred,
    pitch: 1,
    rate: 1,
    lang: preferred?.lang || 'en-US',
  };
}

export function useVoiceSocket(options: UseVoiceSocketOptions): UseVoiceSocketReturn {
  const { character, mode, onTurnStateChange } = options;
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const voiceStateRef = useRef<VoiceState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioWorkletLoadedRef = useRef(false);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTtsTextRef = useRef<string | null>(null);
  const audioReceivedForTurnRef = useRef(false);

  // Keep a live ref so AudioWorklet callbacks see the current state.
  useEffect(() => {
    voiceStateRef.current = voiceState;
    onTurnStateChange?.(voiceState);
  }, [voiceState, onTurnStateChange]);

  const speakWithBrowserTTS = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const config = getVoiceForCharacter(character);
    if (config.voice) utterance.voice = config.voice;
    utterance.pitch = config.pitch;
    utterance.rate = config.rate;
    utterance.lang = config.lang;
    window.speechSynthesis.speak(utterance);
  }, [character]);

  const initAudio = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playAudio = useCallback((pcmData: Float32Array) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const buffer = ctx.createBuffer(1, pcmData.length, 16000);
    buffer.copyToChannel(pcmData, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (playbackQueueRef.current.length > 0) {
        const next = playbackQueueRef.current.shift()!;
        playAudio(next);
      } else {
        isPlayingRef.current = false;
      }
    };
    source.start();
  }, []);

  const queueAudio = useCallback(
    (pcmData: Float32Array) => {
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        playAudio(pcmData);
      } else {
        playbackQueueRef.current.push(pcmData);
      }
    },
    [playAudio]
  );

  const pcmToFloat32 = useCallback((buffer: ArrayBuffer) => {
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }
    return float32Array;
  }, []);

  const sendCommand = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', command }));
    }
  }, []);

  const sendConfig = useCallback(() => {
    if (!character || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'config_change',
        character: character.slug,
        mode: mode?.slug || 'introduction',
      })
    );
  }, [character, mode]);

  const connect = useCallback(
    (deviceId?: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const url = new URL(VOICE_SERVER_URL);
      if (deviceId) url.searchParams.set('device_id', deviceId);
      url.searchParams.set('device_type', 'audio');

      try {
        const ws = new WebSocket(url.toString());
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          sendConfig();
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              handleMessage(msg);
            } catch {
              // ignore malformed JSON
            }
          } else if (event.data instanceof ArrayBuffer) {
            audioReceivedForTurnRef.current = true;
            if (fallbackTimerRef.current) {
              clearTimeout(fallbackTimerRef.current);
              fallbackTimerRef.current = null;
            }
            pendingTtsTextRef.current = null;
            const pcmData = pcmToFloat32(event.data);
            queueAudio(pcmData);
          }
        };

        ws.onerror = () => {
          setError('Connection error. Retrying...');
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;

          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            reconnectTimeoutRef.current = setTimeout(() => {
              connect(deviceId);
            }, delay);
          } else {
            setError('Could not connect to voice server.');
            setVoiceState('error');
          }
        };
      } catch (err) {
        setError('Failed to connect to voice server');
        setVoiceState('error');
      }
    },
    [pcmToFloat32, queueAudio, sendConfig]
  );

  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  }, []);

  const handleMessage = useCallback(
    (msg: any) => {
      switch (msg.type) {
        case 'state_change':
          setVoiceState(msg.state);
          if (msg.state === 'speaking') {
            audioReceivedForTurnRef.current = false;
            pendingTtsTextRef.current = null;
            isPlayingRef.current = false;
            playbackQueueRef.current = [];
            if (fallbackTimerRef.current) {
              clearTimeout(fallbackTimerRef.current);
              fallbackTimerRef.current = null;
            }
          }
          if (msg.state === 'idle') {
            if (fallbackTimerRef.current) {
              clearTimeout(fallbackTimerRef.current);
              fallbackTimerRef.current = null;
            }
            pendingTtsTextRef.current = null;
            audioReceivedForTurnRef.current = false;
          }
          break;

        case 'transcript':
          if (msg.text) {
            setLastTranscript(msg.text);
            addMessage('user', msg.text);
          }
          break;

        case 'assistant_text':
          if (msg.text) {
            setLastResponse(msg.text);
            addMessage('assistant', msg.text);
            if (!audioReceivedForTurnRef.current) {
              pendingTtsTextRef.current = msg.text;
              if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
              fallbackTimerRef.current = setTimeout(() => {
                if (!audioReceivedForTurnRef.current && pendingTtsTextRef.current) {
                  speakWithBrowserTTS(pendingTtsTextRef.current);
                  pendingTtsTextRef.current = null;
                }
              }, 1200);
            }
          }
          break;

        case 'error':
          setError(msg.message || 'An error occurred');
          setVoiceState('error');
          break;

        case 'config_change':
          // Server confirmed config change.
          break;

        case 'interrupt_ack':
          // Server confirmed interrupt; no UI action needed.
          break;

        default:
          console.log('[VoiceSocket] Unknown message type:', msg.type);
      }
    },
    [addMessage, speakWithBrowserTTS]
  );

  const startListening = useCallback(async () => {
    try {
      setError(null);
      await initAudio();

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = audioContextRef.current!;
      if (!audioWorkletLoadedRef.current) {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input && input[0]) {
                const int16Data = new Int16Array(input[0].length);
                for (let i = 0; i < input[0].length; i++) {
                  int16Data[i] = Math.max(-32768, Math.min(32767, input[0][i] * 32768));
                }
                this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
              }
              return true;
            }
          }
          registerProcessor('pcm-processor', PCMProcessor);
        `;

        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(workletUrl);
          audioWorkletLoadedRef.current = true;
        } catch {
          audioWorkletLoadedRef.current = true;
        }
        URL.revokeObjectURL(workletUrl);
      }

      const source = ctx.createMediaStreamSource(stream);
      mediaStreamSourceRef.current = source;
      const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && voiceStateRef.current === 'listening') {
          wsRef.current.send(event.data);
        }
      };

      source.connect(workletNode);
      sendCommand('start_listening');
    } catch (err) {
      let msg = 'Could not access microphone';
      if (err instanceof DOMException) {
        if (err.name === 'NotFoundError') msg = 'No microphone found.';
        else if (err.name === 'NotAllowedError') msg = 'Microphone permission denied.';
        else if (err.name === 'NotReadableError') msg = 'Microphone is busy.';
      }
      setError(msg);
      setVoiceState('error');
    }
  }, [initAudio, connect, sendCommand]);

  const stopListening = useCallback(() => {
    if (mediaStreamSourceRef.current) {
      try {
        mediaStreamSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      mediaStreamSourceRef.current = null;
    }

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
        workletNodeRef.current.port.onmessage = null;
      } catch {
        // ignore
      }
      workletNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    sendCommand('stop_listening');
  }, [sendCommand]);

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      addMessage('user', text.trim());

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'text_input', text: text.trim() }));
      } else {
        setError('Voice server not connected');
        setVoiceState('error');
      }
    },
    [addMessage]
  );

  const interrupt = useCallback(() => {
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    sendCommand('interrupt');
  }, [sendCommand]);

  const clearError = useCallback(() => {
    setError(null);
    if (voiceState === 'error') setVoiceState('idle');
  }, [voiceState]);

  // Send config whenever character/mode changes and socket is open.
  useEffect(() => {
    sendConfig();
  }, [sendConfig]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (mediaStreamSourceRef.current) {
        try {
          mediaStreamSourceRef.current.disconnect();
        } catch {
          // ignore
        }
      }
      if (workletNodeRef.current) {
        try {
          workletNodeRef.current.disconnect();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    voiceState,
    messages,
    lastTranscript,
    lastResponse,
    error,
    isConnected,
    startListening,
    stopListening,
    sendTextMessage,
    interrupt,
    clearError,
  };
}
