import { Component, HostListener, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideSettings, LucideUser, LucidePalette, LucideSlidersHorizontal, LucideTrash2, LucideX } from '@lucide/angular';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { PlatformService } from '../../services/platform.service';

type Tab = 'profile' | 'personalization' | 'appearance';

@Component({
  selector: 'app-settings-modal',
  imports: [
    FormsModule,
    ConfirmDialogComponent,
    LucideSettings,
    LucideUser,
    LucidePalette,
    LucideSlidersHorizontal,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
})
export class SettingsModalComponent {
  readonly platform = inject(PlatformService);
  readonly closed = output<void>();
  readonly tab = signal<Tab>('profile');
  readonly fullName = signal(this.platform.user()?.displayName ?? '');
  readonly email = signal(this.platform.user()?.email ?? '');
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly confirmDelete = signal(false);

  async saveProfile(): Promise<void> {
    this.saving.set(true);
    try {
      await this.platform.updateProfile(this.fullName(), this.email());
      this.saved.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  async setLanguage(language: 'en' | 'ar'): Promise<void> {
    await this.platform.saveLanguage(language);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closed.emit(); }
}
