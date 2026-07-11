export const ROUTE_PATHS = {
  ROOT: "/",
  HOME: "/",
  TEMPLATE_NEW: "/templates/new",
  TEMPLATE_EDIT: "/templates/:id/edit",
} as const

export const buildTemplateEditPath = (id: number | string) =>
  `/templates/${id}/edit`