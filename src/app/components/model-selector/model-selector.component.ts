import { Component, ElementRef, HostListener, computed, input, model, signal } from '@angular/core';
import { LucideCheck, LucideChevronDown, LucideChevronUp } from '@lucide/angular';
import { AI_MODELS, AiModel, ModelId } from '../../models/ui.models';

@Component({
  selector: 'app-model-selector',
  imports: [LucideCheck, LucideChevronDown, LucideChevronUp],
  templateUrl: './model-selector.component.html',
  styleUrl: './model-selector.component.scss',
})
export class ModelSelectorComponent {
  readonly selected = model<ModelId>('qwen');
  readonly models = input<AiModel[]>(AI_MODELS);
  readonly open = signal(false);
  readonly currentName = computed(
    () => this.models().find((model) => model.id === this.selected())?.name ?? '',
  );

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  toggle(): void {
    this.open.update((value) => !value);
  }

  select(id: ModelId): void {
    this.selected.set(id);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
