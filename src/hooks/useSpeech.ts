import { useCallback, useMemo, useRef } from 'react';
import type { Character, ModeConfig } from '@/types';
import { characterConfigs } from '@/lib/characterConfig';
import { getOpenAIKey } from '@/lib/settings';
import { userName } from '@/lib/personalization';

export interface UseSpeechOptions {
  characterRef: React.RefObject<Character | null>;
  modeRef: React.RefObject<ModeConfig | undefined>;
  onResponseText: (text: string) => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

export interface UseSpeechReturn {
  speak: (userText: string) => Promise<void>;
  stop: () => void;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const ENV_OPENAI_KEY = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.replace(
  /^\uFEFF/,
  ''
);

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function useSpeech(options: UseSpeechOptions): UseSpeechReturn {
  const { characterRef, modeRef, onResponseText, onComplete, onError } = options;
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const speak = useCallback(
    async (userText: string) => {
      const openaiKey = getOpenAIKey() ?? ENV_OPENAI_KEY;
      if (!openaiKey) {
        onError('OpenAI API key is not configured.');
        onComplete();
        return;
      }

      const character = characterRef.current;
      const mode = modeRef.current;
      const slug = character?.slug ?? '';
      const config = slug ? characterConfigs[slug] : undefined;

      let systemPrompt = config?.prompt ?? '';
      if (mode?.instruction) {
        systemPrompt += `\n\nMode instruction: ${mode.instruction}`;
      }
      if (userName) {
        systemPrompt += `\n\nThe child's name is ${userName}. Address them by name occasionally and be warm and personal.`;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText },
            ],
            max_tokens: 180,
            temperature: 0.85,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'OpenAI request failed.');
          throw new Error(`OpenAI error ${response.status}: ${text}`);
        }

        const data = (await response.json()) as OpenAIResponse;
        const responseText = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (!responseText) {
          throw new Error('OpenAI returned an empty response.');
        }

        onResponseText(responseText);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        onError(err instanceof Error ? err.message : 'Failed to get a response.');
      } finally {
        onComplete();
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [characterRef, modeRef, onResponseText, onComplete, onError]
  );

  return useMemo(
    () => ({
      speak,
      stop,
    }),
    [speak, stop]
  );
}
