import { Component, effect, inject, signal } from '@angular/core';
import { AppShellComponent } from './components/app-shell/app-shell.component';
import { Page } from './models/ui.models';
import { PlatformService } from './services/platform.service';

@Component({
  selector: 'app-root',
  imports: [AppShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly platform = inject(PlatformService);
  readonly page = signal<Page>('chat');
  readonly collapsed = signal(false);
  readonly projectModalOpen = signal(false);
  readonly profileMenuOpen = signal(false);

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.platform.theme());
    });
    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      await this.platform.loadApiConfig();
      if (this.platform.isAuthenticated) await this.platform.init();
      else await this.platform.localLogin();
    } catch {
      this.platform.error.set('تعذر الاتصال بالخادم. تأكد من تشغيل API وOllama.');
    }
  }

  retry(): void {
    this.platform.error.set(null);
    void this.boot();
  }
}
