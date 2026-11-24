import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePlus, LucideSearch, LucideSparkles, LucideX } from '@lucide/angular';
import { PlatformService } from '../../services/platform.service';
import { SkillCardComponent } from '../skill-card/skill-card.component';

@Component({
  selector: 'app-skills-page',
  imports: [FormsModule, SkillCardComponent, LucideSparkles, LucideSearch, LucidePlus, LucideX],
  templateUrl: './skills-page.component.html',
  styleUrl: './skills-page.component.scss',
})
export class SkillsPageComponent {
  readonly platform = inject(PlatformService);
  readonly query = signal('');
  readonly showCreate = signal(false);
  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly newInstructions = signal('');
  readonly saving = signal(false);

  readonly skills = computed(() => this.platform.skills());
  readonly activeCount = computed(() => this.skills().filter((skill) => skill.enabled).length);
  readonly filteredSkills = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.skills();
    return this.skills().filter(
      (skill) =>
        skill.name.toLowerCase().includes(term) ||
        skill.description.toLowerCase().includes(term),
    );
  });

  toggleSkill(id: string): void {
    const skill = this.skills().find((item) => item.id === id);
    if (skill) void this.platform.toggleSkill(id, !skill.enabled);
  }

  async createSkill(): Promise<void> {
    const name = this.newName().trim();
    if (!name || !this.newDescription().trim() || !this.newInstructions().trim()) return;
    this.saving.set(true);
    try {
      await this.platform.createSkill(name, this.newDescription().trim(), this.newInstructions().trim());
      this.showCreate.set(false);
      this.newName.set('');
      this.newDescription.set('');
      this.newInstructions.set('');
    } finally {
      this.saving.set(false);
    }
  }
}
