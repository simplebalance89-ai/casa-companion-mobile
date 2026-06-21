import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseRecorderOptions {
  onDataAvailable?: (chunk: Blob) => void;
  onStop?: (blob: Blob, mimeType: string) => void;
  onError?: (message: string) => void;
}

export interface UseRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

const MAX_RECORDING_MS = 10000;

const PREFERRED_MIME_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg',
];

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function useRecorder(options: UseRecorderOptions): UseRecorderReturn {
  const { onDataAvailable, onStop, onError } = options;
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const clearRecordingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearRecordingTimeout();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, [clearRecordingTimeout]);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current || isRecording) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          onDataAvailable?.(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        onStop?.(blob, blob.type);
        setIsRecording(false);
      };

      recorder.onerror = () => {
        onError?.('Recording failed.');
        stopRecording();
      };

      recorder.start(100);
      setIsRecording(true);

      timeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access microphone.';
      onError?.(message);
      stopRecording();
    }
  }, [isRecording, onDataAvailable, onStop, onError, stopRecording]);

  useEffect(() => {
    return () => {
      clearRecordingTimeout();
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearRecordingTimeout]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}
