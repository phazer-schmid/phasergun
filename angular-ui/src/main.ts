import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
// TODO: Uncomment when HttpClient configuration is resolved
// import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { OrchestratorService } from './app/services/orchestrator.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // TODO: Uncomment when HttpClient configuration is resolved
    // provideHttpClient(),
    OrchestratorService
  ]
}).catch(err => console.error(err));
