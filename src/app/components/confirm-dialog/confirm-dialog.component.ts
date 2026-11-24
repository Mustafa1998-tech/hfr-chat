import { Component, input, output } from '@angular/core';
import { LucideTrash2 } from '@lucide/angular';

@Component({
  selector: 'app-confirm-dialog',
  imports: [LucideTrash2],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly message = input('Delete conversation?');
  readonly confirmLabel = input('Delete');
  readonly cancelLabel = input('Cancel');
  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
