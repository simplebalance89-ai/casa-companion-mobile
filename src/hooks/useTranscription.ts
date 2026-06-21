import { useCallback, useMemo, useRef, useState } from 'react';
import { getDeepgramKey } from '@/lib/settings';

export interface UseTranscriptionReturn {
  transcribeAudio: (audioBlob: Blob, mimeType: string) => Promise<string>;
  isTranscribing: boolean;
}

const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true';
const TIMEOUT_MS = 25000;

interface DeepgramResponse {
  results?: {
    channels: Array<{
      alternatives: Array<{ transcript: string }>;
    }>;
  };
}

export function useTranscription(): UseTranscriptionReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const transcribeAudio = useCallback(async (audioBlob: Blob, mimeType: string) => {
    const deepgramKey = getDeepgramKey() || import.meta.env.VITE_DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      throw new Error('Deepgram API key is not configured.');
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      setIsTranscribing(true);
      const response = await fetch(DEEPGRAM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': mimeType || 'audio/webm',
        },
        body: audioBlob,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Transcription request failed.');
        throw new Error(`Deepgram error ${response.status}: ${text}`);
      }

      const data = (await response.json()) as DeepgramResponse;
      const transcript =
        data.results?.channels[0]?.alternatives[0]?.transcript ?? '';
      return transcript;
    } finally {
      window.clearTimeout(timeoutId);
      setIsTranscribing(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  return useMemo(
    () => ({
      transcribeAudio,
      isTranscribing,
    }),
    [transcribeAudio, isTranscribing]
  );
}
