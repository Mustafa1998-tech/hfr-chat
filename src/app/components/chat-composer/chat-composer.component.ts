import { Component, ElementRef, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAudioLines,
  LucideFilePenLine,
  LucideMessageSquare,
  LucideMic,
  LucidePenLine,
  LucidePlus,
  LucideWandSparkles,
  LucideX,
  LucideZap,
} from '@lucide/angular';
import { ModelSelectorComponent } from '../model-selector/model-selector.component';
import { AiModel, ModelId } from '../../models/ui.models';
import { PlatformService } from '../../services/platform.service';
import { VoiceService } from '../../services/voice.service';
import { VoiceConversationService } from '../../services/voice-conversation.service';

interface QuickAction {
  label: string;
  icon: 'pen' | 'file' | 'wand' | 'zap';
}

@Component({
  selector: 'app-chat-composer',
  imports: [
    FormsModule,
    ModelSelectorComponent,
    LucideMessageSquare,
    LucidePlus,
    LucideMic,
    LucideAudioLines,
    LucidePenLine,
    LucideFilePenLine,
    LucideWandSparkles,
    LucideZap,
    LucideX,
  ],
  templateUrl: './chat-composer.component.html',
  styleUrl: './chat-composer.component.scss',
})
export class ChatComposerComponent {
  private readonly platform = inject(PlatformService);
  readonly voice = inject(VoiceService);
  readonly conversation = inject(VoiceConversationService);
  readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly selectedModel = model<ModelId>('');
  readonly deepResearch = model(false);
  readonly draft = model('');
  readonly models = input<AiModel[]>([]);
  readonly send = output<{ text: string; attachmentIds: string[] }>();
  readonly attachments = signal<{ id: string; name: string }[]>([]);

  readonly quickActions = computed<QuickAction[]>(() => [
    { label: this.platform.tr('writeEmail'), icon: 'pen' },
    { label: this.platform.tr('teamUpdate'), icon: 'file' },
    { label: this.platform.tr('explainSimply'), icon: 'wand' },
    { label: this.platform.tr('createSkill'), icon: 'zap' },
  ]);

  selectQuickAction(label: string): void {
    this.draft.set(label);
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files ?? [])) {
      try {
        const uploaded = await this.platform.uploadFile(file);
        this.attachments.update((list) => [...list, { id: uploaded.id, name: uploaded.originalFileName }]);
      } catch {
        this.platform.error.set(`Could not upload ${file.name}. Check the file type and size.`);
      }
    }
    input.value = '';
  }

  removeAttachment(id: string): void {
    this.attachments.update((list) => list.filter((item) => item.id !== id));
  }

  submit(): void {
    const text = this.draft().trim();
    if (!text) {
      void this.voice.toggle();
      return;
    }
    this.send.emit({ text, attachmentIds: this.attachments().map((item) => item.id) });
    this.draft.set('');
    this.attachments.set([]);
  }

  get voiceStatusText(): string {
    switch (this.voice.state()) {
      case 'listening': return 'Listening… tap to stop';
      case 'processing': return 'Processing speech…';
      case 'thinking': return 'Thinking…';
      case 'speaking': return 'Speaking…';
      case 'error': return this.voice.error() ?? 'Voice error';
      default: return this.voice.reply() ? 'Voice reply ready' : '';
    }
  }
}
