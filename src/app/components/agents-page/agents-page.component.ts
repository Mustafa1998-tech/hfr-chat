import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideBot,
  LucideCodeXml,
  LucidePlus,
  LucideSearch,
  LucideWorkflow,
  LucideX,
} from '@lucide/angular';
import { AgentDefinition, AGENTS } from '../../models/ui.models';
import { PlatformService } from '../../services/platform.service';

@Component({
  selector: 'app-agents-page',
  imports: [FormsModule, LucideBot, LucideSearch, LucideCodeXml, LucideWorkflow, LucidePlus, LucideX],
  templateUrl: './agents-page.component.html',
  styleUrl: './agents-page.component.scss',
})
export class AgentsPageComponent {
  readonly platform = inject(PlatformService);
  readonly showCreate = signal(false);
  readonly customAgents = signal<AgentDefinition[]>([]);
  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly localNotice = signal(false);
  readonly agents = () => [...AGENTS, ...this.customAgents()];

  async start(agent: AgentDefinition): Promise<void> {
    if (!agent.builtIn) {
      this.localNotice.set(true);
      return;
    }
    this.platform.activeAgent.set(agent.id);
    const chat = await this.platform.createChat();
    this.platform.activeChatId.set(chat.id);
    this.platform.page.set('chat');
  }

  addLocalAgent(): void {
    const name = this.newName().trim();
    if (!name) return;
    this.customAgents.update((list) => [
      ...list,
      {
        id: `custom-${Date.now()}`,
        name,
        description: this.newDescription().trim() || 'وكيل مخصص',
        badge: 'مخصص',
        icon: 'custom',
        builtIn: false,
      },
    ]);
    this.newName.set('');
    this.newDescription.set('');
    this.showCreate.set(false);
    this.localNotice.set(true);
  }
}
