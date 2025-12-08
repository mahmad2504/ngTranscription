import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranscriptionComponent } from './transcription/transcription.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TranscriptionComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
}

