import { Routes } from '@angular/router';
import { ProjectListComponent } from './components/project-list/project-list.component';
import { ProjectFormComponent } from './components/project-form/project-form.component';
import { ProjectDashboardComponent } from './components/project-dashboard/project-dashboard.component';
import { ProjectEditComponent } from './components/project-edit/project-edit.component';

export const routes: Routes = [
  { path: '', component: ProjectListComponent },
  { path: 'projects/new', component: ProjectFormComponent },
  { path: 'projects/:id/edit', component: ProjectEditComponent },
  { path: 'projects/:id', component: ProjectDashboardComponent },
  { path: '**', redirectTo: '' }
];
