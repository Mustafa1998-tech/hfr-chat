import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AGENTS,
  AiModel,
  INITIAL_SKILLS,
  Page,
  Skill,
  Theme,
} from '../models/ui.models';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

export interface ChatDto {
  id: string;
  title: string;
  aIModelId?: string | null;
  createdAt: string;
  updatedAt: string;
  projectId?: string | null;
}

export interface MessageDto {
  id: string;
  chatId: string;
  role: string;
  content: string;
  isError: boolean;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  createdAt: string;
}

export interface SkillDto {
  id: string;
  name: string;
  description: string;
  instructions?: string | null;
  isBuiltIn: boolean;
  isEnabled: boolean;
}

export interface SettingsDto {
  theme: string;
  language: string;
  defaultModelId?: string | null;
}

export interface UploadedFileDto {
  id: string;
  originalFileName: string;
  contentType: string;
  size: number;
}

const DEFAULT_API = 'http://127.0.0.1:5080/api';

const SKILL_ICONS: Record<string, Skill['icon']> = {
  'Canvas Design': 'canvas',
  'Skill Creator': 'creator',
  'Frontend Design': 'frontend',
  'Style Skill Builder': 'style',
  'Template Filling Skill Builder': 'template',
};

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);

  readonly user = signal<CurrentUser | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = signal<Page>('chat');
  readonly theme = signal<Theme>('light');
  readonly language = signal<'en' | 'ar'>('en');
  readonly selectedModel = signal<string>('');
  readonly deepResearch = signal(false);
  readonly skills = signal<Skill[]>(INITIAL_SKILLS.map((s) => ({ ...s })));
  readonly models = signal<AiModel[]>([]);
  readonly chats = signal<ChatDto[]>([]);
  readonly projects = signal<ProjectDto[]>([]);
  readonly messages = signal<MessageDto[]>([]);
  readonly activeChatId = signal<string | null>(null);
  readonly activeAgent = signal<string | null>(null);
  readonly activeAgentName = () =>
    AGENTS.find((agent) => agent.id === this.activeAgent())?.name ?? '';
  readonly streamingText = signal('');
  readonly providerIssue = signal<string | null>(null);

  /** Overridden at runtime by public/config.json — change IIS port without rebuilding. */
  readonly apiBase = signal(DEFAULT_API);

  private accessToken: string | null = localStorage.getItem('HFR.accessToken');
  private refreshToken: string | null = localStorage.getItem('HFR.refreshToken');

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders(
      this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
    );
  }

  async loadApiConfig(): Promise<void> {
    try {
      const response = await fetch(new URL('config.json', document.baseURI).href, { cache: 'no-store' });
      if (response.ok) {
        const config = (await response.json()) as { apiBaseUrl?: string; uiScale?: number };
        if (config.apiBaseUrl) this.apiBase.set(config.apiBaseUrl.replace(/\/$/, ''));
        const scale = Number(config.uiScale);
        if (Number.isFinite(scale) && scale > 0)
          document.documentElement.style.zoom = String(scale);
      }
    } catch {
      // Fall back to the development URL when no config file is deployed.
    }
  }

  /** Loads the authenticated user's real data. Never seeds demo data. */
  private reloginInProgress = false;

  async init(relogin = true): Promise<void> {
    if (!this.accessToken) {
      if (relogin && !this.reloginInProgress) await this.localLogin();
      return;
    }
    try {
      const me = await this.request<CurrentUser>('GET', '/users/me');
      this.user.set(me);
      await Promise.all([
        this.loadModels(),
        this.loadSkills(),
        this.loadProjects(),
        this.loadChats(),
        this.loadSettings(),
      ]);
    } catch {
      const refreshed = await this.tryRefresh();
      if (!refreshed) {
        // Single-user deployment: silently re-establish the local session instead
        // of leaving the app unauthenticated after an expired/invalid token.
        if (relogin && !this.reloginInProgress) {
          this.reloginInProgress = true;
          try { await this.localLogin(); return; }
          finally { this.reloginInProgress = false; }
        }
        this.clearSession();
      }
    }
  }

  /** Single-user local mode: no login screen and no credentials. */
  async localLogin(): Promise<void> {
    const result = await this.postPublic<{ accessToken: string; refreshToken: string }>(
      '/auth/local', {});
    this.storeTokens(result.accessToken, result.refreshToken);
    await this.init(false);
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this.postPublic<{ accessToken: string; refreshToken: string }>(
      '/auth/login', { email, password });
    this.storeTokens(result.accessToken, result.refreshToken);
    await this.init();
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    const result = await this.postPublic<{ accessToken: string; refreshToken: string }>(
      '/auth/register', { email, password, displayName });
    this.storeTokens(result.accessToken, result.refreshToken);
    await this.init();
  }

  async logout(): Promise<void> {
    try {
      if (this.refreshToken)
        await this.request('POST', '/auth/logout', { refreshToken: this.refreshToken });
    } catch { /* local logout still proceeds */ }
    this.clearSession();
  }

  async loadChats(): Promise<void> {
    const result = await this.request<{ items: ChatDto[] }>('GET', '/chats?pageSize=100');
    this.chats.set(result.items);
  }

  async loadProjects(): Promise<void> {
    const list = await this.request<ProjectDto[]>('GET', '/projects');
    this.projects.set(list);
  }

  async loadSkills(): Promise<void> {
    const list = await this.request<SkillDto[]>('GET', '/skills');
    this.skills.set(list.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: skill.isEnabled,
      icon: SKILL_ICONS[skill.name] ?? 'template',
      instructions: skill.instructions ?? '',
      isBuiltIn: skill.isBuiltIn,
    })));
  }

  async loadModels(): Promise<void> {
    const list = await this.request<AiModel[]>('GET', '/models');
    this.models.set(list);
    if (!this.selectedModel() && list.length > 0)
      this.selectedModel.set(list[0].id);
    if (list.length === 0) {
      this.providerIssue.set('No Ollama chat models are installed, or Ollama is not reachable from the API server.');
    } else {
      this.providerIssue.set(null);
    }
  }

  async loadSettings(): Promise<void> {
    const settings = await this.request<SettingsDto>('GET', '/settings');
    if (settings.theme === 'dark' || settings.theme === 'light') this.theme.set(settings.theme);
    if (settings.language === 'ar' || settings.language === 'en') this.language.set(settings.language);
    if (settings.defaultModelId) this.selectedModel.set(settings.defaultModelId);
    this.applyDirection();
  }

  async saveTheme(theme: Theme): Promise<void> {
    const previous = this.theme();
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    try {
      await this.request('PUT', '/settings', { theme });
    } catch (e) {
      this.theme.set(previous);
      document.documentElement.setAttribute('data-theme', previous);
      this.error.set('Theme could not be saved to the server.');
      throw e;
    }
  }

  private readonly translations: Record<string, { en: string; ar: string }> = {
    greeting: { en: 'Good afternoon, {name}', ar: 'صباح الخير، {name}' },
    placeholder: { en: 'How can HFR CHAT help you today?', ar: 'كيف يمكن لـ HFR CHAT مساعدتك اليوم؟' },
    chat: { en: 'Chat', ar: 'المحادثة' },
    deepResearch: { en: 'Deep Research', ar: 'بحث عميق' },
    writeEmail: { en: 'Write an email', ar: 'كتابة بريد إلكتروني' },
    teamUpdate: { en: 'Draft a team update', ar: 'كتابة تحديث للفريق' },
    explainSimply: { en: 'Explain simply', ar: 'شرح مبسط' },
    createSkill: { en: 'Create Skill', ar: 'إنشاء مهارة' },
  };

  tr(key: string): string {
    const entry = this.translations[key];
    return entry ? entry[this.language()] : key;
  }

  private applyDirection(): void {
    const rtl = this.language() === 'ar';
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.documentElement.lang = rtl ? 'ar' : 'en';
  }

  async saveLanguage(language: 'en' | 'ar'): Promise<void> {
    const previous = this.language();
    this.language.set(language);
    this.applyDirection();
    try { await this.request('PUT', '/settings', { language }); }
    catch {
      this.language.set(previous);
      this.applyDirection();
    }
  }

  async updateProfile(displayName: string, email?: string | null): Promise<void> {
    const updated = await this.request<CurrentUser>('PATCH', '/users/me', { displayName, email: email || null });
    this.user.set(updated);
  }

  async deleteAccount(): Promise<void> {
    await this.request('DELETE', '/users/me');
    this.clearSession();
    window.location.reload();
  }

  async searchChats(term: string): Promise<ChatDto[]> {
    const encoded = encodeURIComponent(term);
    const result = await this.request<{ items: ChatDto[] }>('GET', `/chats?search=${encoded}&pageSize=30`);
    return result.items;
  }

  async saveDefaultModel(modelId: string): Promise<void> {
    this.selectedModel.set(modelId);
    try { await this.request('PUT', '/settings', { defaultModelId: modelId }); }
    catch { this.error.set('Model preference could not be saved.'); }
  }

  async saveChatModel(chatId: string, modelId: string): Promise<void> {
    this.selectedModel.set(modelId);
    try {
      await this.request('PATCH', `/chats/${chatId}/model`, { modelId });
    } catch {
      this.error.set('Model preference for this conversation could not be saved.');
    }
  }

  async setDeepResearch(enabled: boolean): Promise<void> {
    this.deepResearch.set(enabled);
    if (enabled)
      this.providerIssue.set('Deep Research needs a configured search provider. None is configured.');
  }

  async createChat(): Promise<ChatDto> {
    const chat = await this.request<ChatDto>('POST', '/chats', { title: 'New chat' });
    await this.loadChats();
    return chat;
  }

  async openChat(id: string): Promise<void> {
    this.activeChatId.set(id);
    this.page.set('chat');
    const list = await this.request<MessageDto[]>('GET', `/chats/${id}/messages`);
    this.messages.set(list);
  }

  closeChat(): void {
    this.activeChatId.set(null);
    this.messages.set([]);
    this.streamingText.set('');
  }

  async renameChat(id: string, title: string): Promise<void> {
    await this.request('PATCH', `/chats/${id}`, { title });
    await this.loadChats();
  }

  async deleteChat(id: string): Promise<void> {
    await this.request('DELETE', `/chats/${id}`);
    if (this.activeChatId() === id) this.closeChat();
    await this.loadChats();
  }

  async toggleSkill(id: string, enabled: boolean): Promise<void> {
    const updated = await this.request<SkillDto>('PUT', `/skills/${id}/enabled`, { isEnabled: enabled });
    this.skills.update((list) => list.map((s) =>
      s.id === id ? { ...s, enabled: updated.isEnabled } : s));
  }

  async createSkill(name: string, description: string, instructions: string): Promise<void> {
    await this.request('POST', '/skills', { name, description, instructions });
    await this.loadSkills();
  }

  async createProject(name: string, description = ''): Promise<void> {
    await this.request('POST', '/projects', { name, description });
    await this.loadProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await this.request('DELETE', `/projects/${id}`);
    await this.loadProjects();
  }

  async transcribeAudio(blob: Blob): Promise<{ text: string; language: string }> {
    const form = new FormData();
    form.append('file', blob, 'voice.webm');
    const response = await fetch(`${this.apiBase()}/voice/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken ?? ''}` },
      body: form,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail?.detail ?? detail?.message ?? `Transcription failed (${response.status})`);
    }
    return response.json();
  }

  async synthesize(text: string): Promise<Blob> {
    const response = await fetch(`${this.apiBase()}/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken ?? ''}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`Speech synthesis failed (${response.status})`);
    return response.blob();
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const result = await this.request<{ translation: string }>('POST', '/translate', { text, from, to });
    return result.translation;
  }

  async uploadFile(file: File): Promise<UploadedFileDto> {
    const form = new FormData();
    form.append('file', file);
    return await this.request<UploadedFileDto>('POST', '/files/upload', form, true);
  }

  /** Streams a real AI response from the API. No text is fabricated locally. */
  async sendMessage(content: string, attachmentIds: string[] = [], signal?: AbortSignal): Promise<string> {
    const chatId = this.activeChatId();
    if (!chatId) return '';
    const requestId = crypto.randomUUID();
    const userMessage: MessageDto = {
      id: requestId, chatId, role: 'user', content, isError: false,
      createdAt: new Date().toISOString(),
    };
    this.messages.update((list) => [...list, userMessage]);
    this.streamingText.set('');
    this.providerIssue.set(null);
    this.busy.set(true);

    try {
      const response = await fetch(`${this.apiBase()}/chats/${chatId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          content,
          requestId,
          aIModelId: this.selectedModel() || null,
          attachmentIds,
          agentKey: this.activeAgent(),
          deepResearch: this.deepResearch(),
        }),
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`Streaming failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assembled = '';
      let completedText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = frame.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim();
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim();
          const data = dataLine ? JSON.parse(dataLine) : {};
          if (event === 'token') {
            assembled += data.text ?? '';
            this.streamingText.set(assembled);
          } else if (event === 'error') {
            this.providerIssue.set(data.message ?? 'AI request failed.');
          } else if (event === 'done') {
            completedText = data.content ?? assembled;
            if (completedText)
              this.messages.update((list) => [...list, {
                id: data.id, chatId, role: 'assistant', content: completedText,
                isError: false, createdAt: new Date().toISOString(),
              }]);
            assembled = '';
            this.streamingText.set('');
          }
        }
      }
      await this.loadChats();
      return completedText || assembled;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Request failed.');
      return '';
    } finally {
      this.busy.set(false);
      this.streamingText.set('');
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
    const headers = isForm
      ? this.authHeaders()
      : this.authHeaders().set('Content-Type', 'application/json');
    const payload = body === undefined ? undefined : isForm ? body : JSON.stringify(body);
    try {
      return await firstValueFrom(
        this.http.request<T>(method, `${this.apiBase()}${path}`, { headers, body: payload as never }),
      );
    } catch (e: any) {
      if (e?.status === 401 && await this.tryRefresh())
        return await this.request<T>(method, path, body, isForm);
      this.error.set(e?.error?.message ?? e?.error?.detail ?? 'Request failed.');
      throw e;
    }
  }

  private async postPublic<T>(path: string, body: unknown): Promise<T> {
    return await firstValueFrom(this.http.post<T>(`${this.apiBase()}${path}`, body));
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const tokens = await this.postPublic<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh', { refreshToken: this.refreshToken });
      this.storeTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch { return false; }
  }

  private storeTokens(access: string, refresh: string): void {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('HFR.accessToken', access);
    localStorage.setItem('HFR.refreshToken', refresh);
  }

  private clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('HFR.accessToken');
    localStorage.removeItem('HFR.refreshToken');
    this.user.set(null);
    this.chats.set([]);
    this.projects.set([]);
    this.messages.set([]);
    this.activeChatId.set(null);
  }
}
