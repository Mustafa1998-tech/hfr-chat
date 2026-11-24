import { Component, inject, input, output, signal } from '@angular/core';
import { LucideFolderOpen, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { PlatformService } from '../../services/platform.service';
import { ProjectDto } from '../../services/platform.service';

@Component({
  selector: 'app-projects-page',
  imports: [LucideFolderOpen, LucidePlus, LucideTrash2, ConfirmDialogComponent],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent {
  readonly platform = inject(PlatformService);
  readonly projects = input<ProjectDto[]>([]);
  readonly createProject = output<void>();
  readonly deleteProject = output<string>();
  readonly pendingDelete = signal<string | null>(null);
}
