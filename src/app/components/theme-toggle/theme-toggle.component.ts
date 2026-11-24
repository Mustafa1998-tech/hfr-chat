import { Component, input, output } from '@angular/core';
import { LucideMoon, LucideSun } from '@lucide/angular';
import { Theme } from '../../models/ui.models';

@Component({
  selector: 'app-theme-toggle',
  imports: [LucideSun, LucideMoon],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  readonly theme = input<Theme>('light');
  readonly themeChange = output<Theme>();
}
