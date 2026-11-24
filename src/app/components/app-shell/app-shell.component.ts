import { Component, inject, model, signal } from '@angular/core';
import { LucideBug } from '@lucide/angular';
import { ChatHomeComponent } from '../chat-home/chat-home.component';
import { CreateProjectModalComponent } from '../create-project-modal/create-project-modal.component';
import { ProfileMenuComponent } from '../profile-menu/profile-menu.component';
import { ProjectsPageComponent } from '../projects-page/projects-page.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SkillsPageComponent } from '../skills-page/skills-page.component';
import { AiModel, ModelId, Page, Skill, Theme } from '../../models/ui.models';
import { PlatformService } from '../../services/platform.service';
import { ChatViewComponent } from '../chat-view/chat-view.component';
import { ReportBugModalComponent } from '../report-bug-modal/report-bug-modal.component';
import { AgentsPageComponent } from '../agents-page/agents-page.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { HelpSupportModalComponent } from '../help-support-modal/help-support-modal.component';
import { TourComponent } from '../tour/tour.component';
import { TranslateModalComponent } from '../translate-modal/translate-modal.component';

@Component({
  selector: 'app-shell',
  imports: [
    SidebarComponent,
    ChatHomeComponent,
    SkillsPageComponent,
    ProjectsPageComponent,
    AgentsPageComponent,
    ProfileMenuComponent,
    CreateProjectModalComponent,
    ChatViewComponent,
    ReportBugModalComponent,
    SearchModalComponent,
    SettingsModalComponent,
    HelpSupportModalComponent,
    TourComponent,
    TranslateModalComponent,
    LucideBug,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  readonly platform = inject(PlatformService);

  readonly page = model<Page>('chat');
  readonly collapsed = model(false);
  readonly theme = model<Theme>('light');
  readonly selectedModel = model<ModelId>('');
  readonly deepResearch = model(false);
  readonly skills = model<Skill[]>([]);
  readonly models = model<AiModel[]>([]);
  readonly projectModalOpen = model(false);
  readonly profileMenuOpen = model(false);
  readonly reportModalOpen = signal(false);
  readonly searchModalOpen = signal(false);
  readonly settingsModalOpen = signal(false);
  readonly helpModalOpen = signal(false);
  readonly tourOpen = signal(false);
  readonly translateOpen = signal(false);
  readonly translateInitial = signal('');

  openTranslate(): void {
    const messages = this.platform.messages();
    this.translateInitial.set(messages[messages.length - 1]?.content ?? '');
    this.translateOpen.set(true);
  }

  async onHomeSend(payload: { text: string; attachmentIds: string[] }): Promise<void> {
    const chat = await this.platform.createChat();
    this.platform.activeChatId.set(chat.id);
    await this.platform.sendMessage(payload.text, payload.attachmentIds);
  }

  onChatSelected(id: string): void {
    void this.platform.openChat(id);
  }

  async createProject(name: string, description: string): Promise<void> {
    await this.platform.createProject(name, description);
    this.projectModalOpen.set(false);
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.platform.saveTheme(theme);
    this.theme.set(theme);
  }
}
