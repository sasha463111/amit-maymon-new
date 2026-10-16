// 📝 Email templates (16/10, Tomer: "תבנה את 1-6"). The case's details fill in
// by themselves: {plate}, {claimNumber}… A missing detail shows as "____" so the
// writer sees what to complete before sending.

export type MailVars = {
  customer?: string | null;
  plate?: string | null;
  claimNumber?: string | null;
  insurer?: string | null;
  handler?: string | null;
  appraiser?: string | null;
  amount?: string | null;
  approvedOn?: string | null;
  myName?: string | null;
};

export type MailTemplate = { id: string; label: string; subject: string; body: string };

export const MAIL_TEMPLATES: MailTemplate[] = [
  {
    id: 'payment_request',
    label: 'בקשת תשלום מחברת הביטוח',
    subject: 'בקשת תשלום — תביעה {claimNumber} · רכב {plate}',
    body: 'שלום {handler},\n\nבהמשך לאישור התשלום בתביעה מס׳ {claimNumber} (רכב {plate}, המבוטח/ת {customer}), נבקש להעביר את התשלום בסך {amount} לחשבון המוסך.\nמצורפים המסמכים הרלוונטיים.\n\nתודה,\n{myName}\nמרכז שירות תהילה',
  },
  {
    id: 'payment_reminder',
    label: 'תזכורת — תשלום שטרם התקבל',
    subject: 'תזכורת: תשלום פתוח — תביעה {claimNumber} · רכב {plate}',
    body: 'שלום {handler},\n\nטרם התקבל התשלום בתביעה מס׳ {claimNumber} (רכב {plate}, {customer}), שאושר ב-{approvedOn} בסך {amount}.\nנודה לעדכון לגבי מועד ההעברה.\n\nבברכה,\n{myName}\nמרכז שירות תהילה',
  },
  {
    id: 'send_documents',
    label: 'שליחת מסמכים / דוח שמאי',
    subject: 'מסמכים לתביעה {claimNumber} · רכב {plate}',
    body: 'שלום {handler},\n\nמצורפים המסמכים לתביעה מס׳ {claimNumber} — רכב {plate}, {customer}.\nנשמח לאישור קבלה.\n\nבברכה,\n{myName}\nמרכז שירות תהילה',
  },
  {
    id: 'appraiser_request',
    label: 'פנייה לשמאי',
    subject: 'רכב {plate} — {customer}',
    body: 'שלום {appraiser},\n\nבנוגע לרכב {plate} של {customer} ({insurer}):\n\n\nתודה,\n{myName}\nמרכז שירות תהילה',
  },
  {
    id: 'customer_documents',
    label: 'בקשת מסמכים מהלקוח',
    subject: 'מסמכים לטיפול ברכב {plate}',
    body: 'שלום {customer},\n\nכדי להמשיך בטיפול מול חברת הביטוח ברכב {plate}, נבקש לשלוח לנו:\n• רישיון נהיגה\n• רישיון רכב\n• \n\nאפשר לענות למייל הזה עם צילום של המסמכים.\n\nתודה,\n{myName}\nמרכז שירות תהילה',
  },
  {
    id: 'status_update',
    label: 'עדכון סטטוס',
    subject: 'עדכון — רכב {plate}',
    body: 'שלום,\n\nעדכון לגבי רכב {plate} ({customer}):\n\n\nבברכה,\n{myName}\nמרכז שירות תהילה',
  },
];

/** Fill a template; a missing detail → "____". */
export function fillTemplate(text: string, vars: MailVars): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k];
    return v && String(v).trim() ? String(v).trim() : '____';
  });
}
