import { Component, HostListener, output, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { LucideFolderPlus, LucideX } from '@lucide/angular';
import { PROJECT_SUGGESTIONS } from '../../models/ui.models';

@Component({
  selector: 'app-create-project-modal',
  imports: [FormsModule, LucideFolderPlus, LucideX],
  templateUrl: './create-project-modal.component.html',
  styleUrl: './create-project-modal.component.scss',
})
export class CreateProjectModalComponent {
  readonly closed = output<void>();
  readonly create = output<{ name: string; description: string }>();
  readonly suggestions = PROJECT_SUGGESTIONS;
  readonly projectName = signal('');
  readonly selectedSuggestion = signal<string | null>(null);

  selectSuggestion(label: string): void {
    this.selectedSuggestion.set(label);
    this.projectName.set(label);
  }

  cancel(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    const name = this.projectName().trim();
    if (!name) return;
    this.create.emit({ name, description: '' });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
