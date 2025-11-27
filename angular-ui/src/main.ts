import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { OrchestratorService } from './app/services/orchestrator.service';

bootstrapApplication(AppComponent, {
  providers: [
    OrchestratorService
  ]
}).catch(err => console.error(err));
