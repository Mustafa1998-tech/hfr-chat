import { Component, output, signal } from '@angular/core';

interface TourStep { title: string; body: string; }

@Component({
  selector: 'app-tour',
  templateUrl: './tour.component.html',
  styleUrl: './tour.component.scss',
})
export class TourComponent {
  readonly closed = output<void>();
  readonly steps: TourStep[] = [
    {
      title: 'Start a Conversation',
      body: 'Ask the AI anything. Create reports, summarize documents, generate code, build charts, draft emails, and get answers to complex questions — all in one place.',
    },
    {
      title: 'Explore Skills',
      body: 'Enable or disable built-in skills, create your own instructions, and change how HFR responds to your prompts.',
    },
    {
      title: 'Organize with Projects',
      body: 'Keep chats, instructions and files together so you can return to ongoing work later.',
    },
  ];
  readonly index = signal(0);

  next(): void {
    if (this.index() >= this.steps.length - 1) this.closed.emit();
    else this.index.update((value) => value + 1);
  }
}
