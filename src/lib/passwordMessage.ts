// The WhatsApp text the CEO sends each person with their password (Amit, 15/10).
// Separate from passwords.ts, which uses node crypto and is server-only.
/** The WhatsApp text the CEO sends each person with their password. */
export function passwordMessage(name: string, email: string, password: string, siteUrl: string): string {
  return [
    `שלום ${name.split(' ')[0] || name} 👋`,
    'מהיום הכניסה למערכת של תהילה היא עם סיסמה אישית.',
    '',
    `🌐 כתובת: ${siteUrl}`,
    `📧 מייל: ${email}`,
    `🔑 סיסמה: ${password}`,
    '',
    'הסיסמה אישית – לא להעביר לאף אחד.',
    'שכחת? פונים לעמית והוא מאפס.',
  ].join('\n');
}
