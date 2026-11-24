import { Component, HostListener, output, signal } from '@angular/core';
import { LucideLifeBuoy, LucideMessageCircle, LucideBug, LucideCompass, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-help-support-modal',
  imports: [LucideLifeBuoy, LucideMessageCircle, LucideBug, LucideCompass, LucideX],
  templateUrl: './help-support-modal.component.html',
  styleUrl: './help-support-modal.component.scss',
})
export class HelpSupportModalComponent {
  readonly closed = output<void>();
  readonly openReport = output<void>();
  readonly openTour = output<void>();
  readonly contactNotice = signal(false);

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closed.emit(); }
}
