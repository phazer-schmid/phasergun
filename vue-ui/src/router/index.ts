import { createRouter, createWebHistory } from 'vue-router'
import ProjectList from '../views/ProjectList.vue'
import ProjectForm from '../views/ProjectForm.vue'
import ProjectDashboard from '../views/ProjectDashboard.vue'
import ProjectEdit from '../views/ProjectEdit.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: ProjectList
    },
    {
      path: '/projects/new',
      name: 'project-new',
      component: ProjectForm
    },
    {
      path: '/projects/:id/edit',
      name: 'project-edit',
      component: ProjectEdit
    },
    {
      path: '/projects/:id',
      name: 'project-dashboard',
      component: ProjectDashboard
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
