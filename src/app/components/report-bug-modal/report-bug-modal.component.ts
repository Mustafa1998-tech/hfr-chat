import { Component, HostListener, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBug, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-report-bug-modal',
  imports: [FormsModule, LucideBug, LucideX],
  templateUrl: './report-bug-modal.component.html',
  styleUrl: './report-bug-modal.component.scss',
})
export class ReportBugModalComponent {
  readonly closed = output<void>();
  readonly title = signal('');
  readonly details = signal('');
  readonly attachScreenshot = signal(false);
  readonly submitted = signal(false);

  get canSubmit(): boolean {
    return this.title().trim().length > 0 && this.details().trim().length > 0;
  }

  submit(): void {
    if (!this.canSubmit) return;
    // No reporting service is configured: do not pretend the report was sent.
    this.submitted.set(true);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
