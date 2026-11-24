import { Component, computed, inject, input, model, output } from '@angular/core';
import { ChatComposerComponent } from '../chat-composer/chat-composer.component';
import { AiModel, ModelId } from '../../models/ui.models';
import { PlatformService } from '../../services/platform.service';

@Component({
  selector: 'app-chat-home',
  imports: [ChatComposerComponent],
  templateUrl: './chat-home.component.html',
  styleUrl: './chat-home.component.scss',
})
export class ChatHomeComponent {
  readonly platform = inject(PlatformService);
  readonly selectedModel = model<ModelId>('');
  readonly deepResearch = model(false);
  readonly models = input<AiModel[]>([]);
  readonly send = output<{ text: string; attachmentIds: string[] }>();

  readonly firstName = computed(() => {
    const name = this.platform.user()?.displayName ?? 'there';
    return name.split(/\s+/)[0];
  });

  onSend(payload: { text: string; attachmentIds: string[] }): void {
    this.send.emit(payload);
  }

  onModelChange(modelId: string): void {
    this.selectedModel.set(modelId);
    void this.platform.saveDefaultModel(modelId);
  }
}
