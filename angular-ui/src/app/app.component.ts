import { Component } from '@angular/core';
import { AppContainerComponent } from './components/app-container/app-container.component';

@Component({
  selector: 'app-root',
  template: '<app-container></app-container>',
  styleUrls: [],
  imports: [AppContainerComponent],
  standalone: true
})
export class AppComponent {
  title = 'fda-510k-compliance-angular';
}
