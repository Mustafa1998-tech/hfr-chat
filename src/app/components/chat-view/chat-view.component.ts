import { Component, computed, inject, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { ChatComposerComponent } from '../chat-composer/chat-composer.component';
import { PlatformService } from '../../services/platform.service';

@Component({
  selector: 'app-chat-view',
  imports: [ChatComposerComponent, ConfirmDialogComponent],
  templateUrl: './chat-view.component.html',
  styleUrl: './chat-view.component.scss',
})
export class ChatViewComponent {
  readonly platform = inject(PlatformService);
  readonly confirmOpen = signal(false);
  readonly translateRequested = output<void>();
  readonly title = computed(() =>
    this.platform.chats().find((chat) => chat.id === this.platform.activeChatId())?.title ?? 'Chat');

  send(payload: { text: string; attachmentIds: string[] }): void {
    void this.platform.sendMessage(payload.text, payload.attachmentIds);
  }

  onModelChange(modelId: string): void {
    const chatId = this.platform.activeChatId();
    if (chatId) void this.platform.saveChatModel(chatId, modelId);
    else void this.platform.saveDefaultModel(modelId);
  }
}
