import { Component, inject, input, output } from '@angular/core';
import {
  LucideCircleHelp,
  LucideCompass,
  LucideLanguages,
  LucideSearch,
  LucideSettings,
} from '@lucide/angular';
import { Theme } from '../../models/ui.models';
import { CurrentUser, PlatformService } from '../../services/platform.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-profile-menu',
  imports: [
    ThemeToggleComponent,
    LucideSearch,
    LucideSettings,
    LucideCircleHelp,
    LucideCompass,
    LucideLanguages,
  ],
  templateUrl: './profile-menu.component.html',
  styleUrl: './profile-menu.component.scss',
})
export class ProfileMenuComponent {
  readonly platform = inject(PlatformService);
  readonly theme = input<Theme>('light');
  readonly user = input<CurrentUser | null>(null);
  readonly themeChange = output<Theme>();
  readonly closed = output<void>();
  readonly searchRequested = output<void>();
  readonly settingsRequested = output<void>();
  readonly tourRequested = output<void>();
  readonly helpRequested = output<void>();
  readonly translateRequested = output<void>();
}
