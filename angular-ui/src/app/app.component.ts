import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
  styleUrls: [],
  imports: [RouterOutlet],
  standalone: true
})
export class AppComponent {
  title = 'fda-510k-compliance-angular';
}
