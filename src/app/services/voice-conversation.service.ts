import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

export type ConversationState =
  | 'idle'
  | 'listening'
  | 'user_speaking'
  | 'transcribing'
  | 'ai_thinking'
  | 'ai_speaking'
  | 'interrupted'
  | 'error';

export interface VoiceTurn {
  role: 'user' | 'ai';
  text: string;
}

/**
 * Continuous two-way voice mode: one click starts the call, VAD detects turns,
 * each turn flows through the real STT → Ollama → TTS backend, then the call
 * automatically returns to listening until the user ends it.
 */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!؟؟\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const result: string[] = [];
  let buffer = '';
  for (const part of parts) {
    if ((buffer + ' ' + part).trim().length > 220 && buffer) {
      result.push(buffer.trim());
      buffer = part;
    } else {
      buffer = buffer ? `${buffer} ${part}` : part;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result.length ? result : [text];
}

@Injectable({ providedIn: 'root' })
export class VoiceConversationService {
  private readonly platform = inject(PlatformService);

  readonly active = signal(false);
  readonly state = signal<ConversationState>('idle');
  readonly speaker = signal<'user' | 'ai' | null>(null);
  readonly muted = signal(false);
  readonly transcript = signal('');
  readonly aiText = signal('');
  readonly error = signal<string | null>(null);
  readonly turns = signal<VoiceTurn[]>([]);
  readonly latency = signal<{ sttMs: number; aiMs: number; ttsMs: number; totalMs: number } | null>(null);

  private turnStartedAt = 0;

  // Tunable turn detection (milliseconds / RMS thresholds).
  readonly silenceMs = 1200;
  private readonly startRms = 0.018;
  private readonly stopRms = 0.012;
  private readonly minTurnMs = 600;

  private stream?: MediaStream;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private samples?: Uint8Array<ArrayBuffer>;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private audio?: HTMLAudioElement;
  private audioUrl?: string;
  private audioDone?: () => void;
  private aborter?: AbortController;
  private recording = false;
  private speechStartedAt = 0;
  private lastVoiceAt = 0;
  private bargeInAt = 0;
  private processing = false;
  private peakRms = 0;

  get stateLabel(): string {
    const labels: Record<ConversationState, string> = {
      idle: 'جاهز',
      listening: 'جارٍ الاستماع…',
      user_speaking: 'أنت تتحدث…',
      transcribing: 'جارٍ فهم كلامك…',
      ai_thinking: 'يفكر…',
      ai_speaking: 'يتحدث…',
      interrupted: 'تمت المقاطعة',
      error: 'خطأ',
    };
    return labels[this.state()];
  }

  async start(): Promise<void> {
    if (this.active()) return;
    this.error.set(null);
    this.turns.set([]);
    this.transcript.set('');
    this.aiText.set('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('الميكروفون أو التسجيل غير مدعوم في هذا المتصفح.');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.context = new AudioContext();
      await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onstop = () => {
        if (this.processing) void this.processTurn(new Blob(this.chunks, {
          type: this.recorder?.mimeType || 'audio/webm',
        }));
      };

      this.active.set(true);
      this.muted.set(false);
      this.state.set('listening');
      this.speaker.set(null);
      this.timer = setInterval(() => this.tick(), 100);
    } catch (error) {
      this.error.set(this.describe(error));
      this.state.set('error');
      this.cleanup();
    }
  }

  end(): void {
    this.cleanup();
    this.active.set(false);
    this.state.set('idle');
    this.speaker.set(null);
    this.error.set(null);
    this.turns.set([]);
    this.transcript.set('');
    this.aiText.set('');
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = !next));
    if (next && this.recording) {
      this.processing = false;
      this.recorder?.stop();
      this.recording = false;
      this.state.set('listening');
      this.speaker.set(null);
    }
  }

  /** Barge-in fallback: stops playback and generation, then listens again. */
  interrupt(): void {
    this.aborter?.abort();
    this.stopAudio();
    this.state.set('interrupted');
    this.speaker.set(null);
    setTimeout(() => {
      if (this.active() && this.state() === 'interrupted') {
        this.state.set('listening');
        this.error.set(null);
      }
    }, 400);
  }

  private tick(): void {
    if (!this.active() || this.muted() || this.processing) return;
    const rms = this.currentRms();
    if (this.recording) this.peakRms = Math.max(this.peakRms, rms);
    const now = performance.now();

    if (this.state() === 'ai_speaking') {
      // Barge-in: only a sustained level above the normal start threshold counts,
      // acoustic echo cancellation helps prevent the AI's own voice from triggering it.
      if (rms > this.startRms * 2) {
        if (!this.bargeInAt) this.bargeInAt = now;
        else if (now - this.bargeInAt > 350) this.interrupt();
      } else {
        this.bargeInAt = 0;
      }
      return;
    }

    if (rms > this.startRms) {
      this.lastVoiceAt = now;
      if (!this.recording) this.beginRecording(now);
      this.state.set('user_speaking');
      this.speaker.set('user');
      return;
    }

    if (this.recording && this.state() === 'user_speaking' && now - this.lastVoiceAt > this.silenceMs) {
      const duration = now - this.speechStartedAt;
      if (duration >= this.minTurnMs) {
        this.turnStartedAt = performance.now();
        this.processing = true;
        this.state.set('transcribing');
        this.speaker.set(null);
        this.recording = false;
        this.recorder?.stop();
      } else {
        this.processing = false;
        this.chunks = [];
        this.recording = false;
        this.recorder?.stop();
        this.state.set('listening');
        this.speaker.set(null);
      }
    }
  }

  private beginRecording(now: number): void {
    this.chunks = [];
    this.peakRms = 0;
    this.recorder?.start();
    this.recording = true;
    this.speechStartedAt = now;
    this.lastVoiceAt = now;
  }

  private async processTurn(blob: Blob): Promise<void> {
    // Never send silence/noise to STT: prevents empty-transcript (422) responses.
    if (this.peakRms < this.startRms * 1.5 || blob.size < 2000) {
      this.state.set('listening');
      this.speaker.set(null);
      return;
    }
    try {
      const result = await this.platform.transcribeAudio(blob);
      if (!result.text?.trim()) {
        this.state.set('listening');
        return;
      }
      const sttMs = Math.round(performance.now() - this.turnStartedAt);
      this.transcript.set(result.text);
      this.turns.update((list) => [...list, { role: 'user', text: result.text }]);

      this.state.set('ai_thinking');
      if (!this.platform.activeChatId()) {
        const chat = await this.platform.createChat();
        this.platform.activeChatId.set(chat.id);
      }
      this.aborter = new AbortController();
      const answer = await this.platform.sendMessage(result.text, [], this.aborter.signal);
      if (!answer) {
        this.error.set(this.platform.error() ?? 'تعذر الحصول على رد.');
        this.state.set('error');
        return;
      }
      const aiMs = Math.round(performance.now() - this.turnStartedAt - sttMs);
      this.aiText.set(answer);
      this.turns.update((list) => [...list, { role: 'ai', text: answer }]);
      this.state.set('ai_speaking');
      this.speaker.set('ai');

      // Sentence-level TTS: synthesise and play the first sentence as soon as it is
      // ready, then continue with the remaining sentences in order.
      const sentences = splitSentences(answer);
      let firstAudioMs = 0;
      for (const sentence of sentences) {
        if (this.state() !== 'ai_speaking') break;
        const audio = await this.platform.synthesize(sentence);
        if (!firstAudioMs) {
          firstAudioMs = Math.round(performance.now() - this.turnStartedAt);
          this.latency.set({
            sttMs,
            aiMs,
            ttsMs: Math.round(performance.now() - this.turnStartedAt - sttMs - aiMs),
            totalMs: firstAudioMs,
          });
        }
        await this.playAudio(audio);
      }
      if (this.active() && this.state() === 'ai_speaking') {
        this.state.set('listening');
        this.speaker.set(null);
        this.aiText.set('');
      }
      if (this.state() !== 'ai_speaking' && this.state() !== 'listening') return;
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      this.error.set(error instanceof Error ? error.message : 'فشلت المحادثة الصوتية.');
      this.state.set('error');
      setTimeout(() => {
        if (this.active() && this.state() === 'error') {
          this.state.set('listening');
          this.error.set(null);
        }
      }, 2500);
    } finally {
      this.processing = false;
      this.chunks = [];
      this.bargeInAt = 0;
      if (this.active() && !['ai_speaking', 'error', 'interrupted'].includes(this.state())) {
        this.state.set('listening');
        this.speaker.set(null);
      }
    }
  }

  private currentRms(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const value of this.samples) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / this.samples.length);
  }

  private playAudio(blob: Blob): Promise<void> {
    this.stopAudio();
    this.audioUrl = URL.createObjectURL(blob);
    const element = new Audio(this.audioUrl);
    this.audio = element;
    return new Promise<void>((resolve) => {
      const done = () => {
        this.stopAudio();
        resolve();
      };
      this.audioDone = done;
      element.onended = done;
      element.onerror = () => {
        this.error.set('تعذر تشغيل جزء من الصوت. أكمل بالنص أو أعد المحاولة.');
        done();
      };
      element.play().catch(() => {
        this.error.set('تم حظر تشغيل الصوت. اضغط مقاطعة ثم تابع.');
        done();
      });
    });
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio = undefined;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = undefined;
    }
    const done = this.audioDone;
    this.audioDone = undefined;
    done?.();
  }

  private cleanup(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.aborter?.abort();
    this.stopAudio();
    if (this.recording) this.recorder?.stop();
    this.recording = false;
    this.processing = false;
    this.chunks = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.analyser = undefined;
  }

  private describe(error: unknown): string {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      return 'تم رفض إذن الميكروفون. اسمح بالوصول للميكروفون.';
    if (name === 'NotFoundError') return 'لم يتم العثور على ميكروفون.';
    return error instanceof Error ? error.message : 'تعذر بدء المكالمة الصوتية.';
  }
}
