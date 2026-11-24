import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking' | 'error';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly platform = inject(PlatformService);

  readonly state = signal<VoiceState>('idle');
  readonly error = signal<string | null>(null);
  readonly transcript = signal('');
  readonly reply = signal('');
  readonly language = signal('');

  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private audio?: HTMLAudioElement;

  get isRecording(): boolean {
    return this.state() === 'listening';
  }

  async toggle(): Promise<void> {
    if (this.state() === 'listening') {
      this.stopRecording();
      return;
    }
    if (this.state() === 'speaking') {
      this.stopPlayback();
      return;
    }
    await this.startRecording();
  }

  cancel(): void {
    this.stopRecording();
    this.stopPlayback();
    this.state.set('idle');
    this.error.set(null);
    this.transcript.set('');
    this.reply.set('');
    this.language.set('');
  }

  replay(): void {
    if (!this.reply()) return;
    void this.speak(this.reply());
  }

  private async startRecording(): Promise<void> {
    this.error.set(null);
    this.transcript.set('');
    this.reply.set('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Recording is not supported by this browser.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onstop = () => {
        void this.processRecording(new Blob(this.chunks, {
          type: this.recorder?.mimeType || 'audio/webm',
        }));
      };
      this.recorder.start();
      this.state.set('listening');
    } catch (error) {
      this.releaseMicrophone();
      this.state.set('error');
      this.error.set(this.describeError(error));
    }
  }

  private stopRecording(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.releaseMicrophone();
  }

  private releaseMicrophone(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }

  private async processRecording(blob: Blob): Promise<void> {
    this.state.set('processing');
    this.releaseMicrophone();
    try {
      const result = await this.platform.transcribeAudio(blob);
      if (!result.text?.trim()) {
        this.state.set('error');
        this.error.set('No speech was recognized. Please try again.');
        return;
      }
      this.transcript.set(result.text);
      this.language.set(result.language);
      this.state.set('thinking');

      if (!this.platform.activeChatId()) {
        const chat = await this.platform.createChat();
        this.platform.activeChatId.set(chat.id);
      }
      const answer = await this.platform.sendMessage(result.text);
      if (!answer) {
        this.state.set('error');
        this.error.set(this.platform.error() ?? 'The assistant could not reply.');
        return;
      }
      this.reply.set(answer);
      await this.speak(answer);
    } catch (error) {
      this.state.set('error');
      this.error.set(error instanceof Error ? error.message : 'Voice session failed.');
    }
  }

  private async speak(text: string): Promise<void> {
    this.stopPlayback();
    this.state.set('speaking');
    try {
      const blob = await this.platform.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.audio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.audio = undefined;
        if (this.state() === 'speaking') this.state.set('idle');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.audio = undefined;
        this.state.set('error');
        this.error.set('Audio playback failed. Use Replay to try again.');
      };
      // The recording was started by a user gesture, so autoplay is normally permitted.
      await audio.play();
    } catch {
      this.state.set('error');
      this.error.set('Audio playback was blocked by the browser. Tap Replay to play the reply.');
    }
  }

  stopPlayback(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = undefined;
    }
  }

  private describeError(error: unknown): string {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      return 'Microphone permission denied. Allow microphone access in your browser.';
    if (name === 'NotFoundError') return 'No microphone was found on this device.';
    return error instanceof Error ? error.message : 'Microphone access failed.';
  }
}
