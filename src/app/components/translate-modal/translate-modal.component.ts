import { Component, HostListener, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowLeftRight,
  LucideLanguages,
  LucideLoader,
  LucideX,
} from '@lucide/angular';
import { PlatformService } from '../../services/platform.service';

type Lang = 'auto' | 'en' | 'ar';

@Component({
  selector: 'app-translate-modal',
  imports: [FormsModule, LucideLanguages, LucideArrowLeftRight, LucideLoader, LucideX],
  templateUrl: './translate-modal.component.html',
  styleUrl: './translate-modal.component.scss',
})
export class TranslateModalComponent {
  readonly platform = inject(PlatformService);
  readonly closed = output<void>();
  readonly initialText = input('');

  readonly text = signal(this.initialText());
  readonly from = signal<Lang>('auto');
  readonly to = signal<'en' | 'ar'>('ar');
  readonly result = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initialText();
      if (initial && !this.text()) {
        this.text.set(initial);
        this.detect();
      }
    });
  }

  detect(): void {
    const hasArabic = /[\u0600-\u06FF]/.test(this.text());
    this.from.set(hasArabic ? 'ar' : 'en');
    this.to.set(hasArabic ? 'en' : 'ar');
    this.result.set('');
  }

  swap(): void {
    if (this.from() === 'auto') return;
    const previousFrom = this.from() as 'en' | 'ar';
    this.from.set(this.to());
    this.to.set(previousFrom);
    this.result.set('');
  }

  async translate(): Promise<void> {
    if (!this.text().trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.result.set(await this.platform.translate(this.text(), this.from(), this.to()));
    } catch {
      this.error.set('Translation failed. Check the Ollama connection.');
    } finally {
      this.busy.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closed.emit(); }
}
