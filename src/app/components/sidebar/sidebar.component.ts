import { Component, inject, input, model, output } from '@angular/core';
import {
  LucideBot,
  LucideChevronLeft,
  LucideChevronRight,
  LucideEllipsis,
  LucideFolder,
  LucideMessageSquare,
  LucidePanelLeft,
  LucidePlus,
  LucideSearch,
  LucideShare2,
  LucideSparkles,
} from '@lucide/angular';
import { Page } from '../../models/ui.models';
import { ChatDto, PlatformService } from '../../services/platform.service';

@Component({
  selector: 'app-sidebar',
  imports: [
    LucidePanelLeft,
    LucideSearch,
    LucidePlus,
    LucideSparkles,
    LucideFolder,
    LucideBot,
    LucideMessageSquare,
    LucideShare2,
    LucideEllipsis,
    LucideChevronLeft,
    LucideChevronRight,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly platform = inject(PlatformService);
  readonly collapsed = model(false);
  readonly page = model<Page>('chat');
  readonly profileMenuOpen = model(false);
  readonly chats = input<ChatDto[]>([]);
  readonly username = input('Account');
  readonly chatSelected = output<string>();
  readonly newChat = output<void>();

  navigate(page: Page): void {
    if (page !== 'chat') this.platform.closeChat();
    this.page.set(page);
  }

  startNewChat(): void {
    this.platform.activeAgent.set(null);
    this.platform.closeChat();
    this.navigate('chat');
    this.newChat.emit();
  }

  openChat(id: string): void {
    this.chatSelected.emit(id);
  }

  toggleSidebar(): void {
    this.collapsed.update((value) => !value);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((value) => !value);
  }
}
