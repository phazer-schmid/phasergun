import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { OrchestratorService } from './app/services/orchestrator.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    OrchestratorService
  ]
}).catch(err => console.error(err));
