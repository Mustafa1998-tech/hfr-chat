import { Component, computed, input, output, signal } from '@angular/core';
import {
  LucideBadgeCheck,
  LucideChevronDown,
  LucideChevronUp,
  LucideFileText,
  LucideLayoutTemplate,
  LucideShapes,
  LucideWandSparkles,
} from '@lucide/angular';
import { Skill } from '../../models/ui.models';

@Component({
  selector: 'app-skill-card',
  imports: [
    LucideShapes,
    LucideWandSparkles,
    LucideLayoutTemplate,
    LucideBadgeCheck,
    LucideFileText,
    LucideChevronDown,
    LucideChevronUp,
  ],
  templateUrl: './skill-card.component.html',
  styleUrl: './skill-card.component.scss',
})
export class SkillCardComponent {
  readonly skill = input.required<Skill>();
  readonly toggle = output<string>();
  readonly expanded = signal(false);
  readonly hasOverflow = computed(() => this.skill().description.length > 170);
}
