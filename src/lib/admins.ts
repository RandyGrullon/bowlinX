/**
 * Correos que siempre son admin. Debe coincidir con la lista de isFixedAdmin() en firestore.rules.
 * Otros admins se nombran desde la app (users/{uid}.role = 'admin').
 */
export const FIXED_ADMIN_EMAILS = ['admin@admin.com'];

export const isFixedAdmin = (email: string | null | undefined) =>
  !!email && FIXED_ADMIN_EMAILS.includes(email.toLowerCase());
