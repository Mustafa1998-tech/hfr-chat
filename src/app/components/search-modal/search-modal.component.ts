import { Component, HostListener, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideMessageCircle, LucideSearch, LucideX } from '@lucide/angular';
import { ChatDto, PlatformService } from '../../services/platform.service';

@Component({
  selector: 'app-search-modal',
  imports: [FormsModule, LucideSearch, LucideMessageCircle, LucideX],
  templateUrl: './search-modal.component.html',
  styleUrl: './search-modal.component.scss',
})
export class SearchModalComponent {
  readonly platform = inject(PlatformService);
  readonly closed = output<void>();
  readonly term = signal('');
  readonly results = signal<ChatDto[]>([]);
  readonly searched = signal(false);

  async search(): Promise<void> {
    const value = this.term().trim();
    if (!value) { this.results.set([]); this.searched.set(false); return; }
    try {
      this.results.set(await this.platform.searchChats(value));
      this.searched.set(true);
    } catch { this.results.set([]); }
  }

  relative(date: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  open(chat: ChatDto): void {
    void this.platform.openChat(chat.id);
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closed.emit(); }
}
