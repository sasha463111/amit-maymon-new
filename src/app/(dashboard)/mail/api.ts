import { attachMailToTarget, deleteMail, disconnectOutlook, getMail, getMailAttachment, listMail, listTargetFiles, mailContext, recentAddresses, searchAttachTargets, sendOutlookMail } from '@/app/actions/outlook';

// The mail functions a page hands to MailClient / CaseMailButton (server
// actions — each checks the user itself). One list, so pages don't drift.
export const MAIL_API = { listMail, getMail, searchAttachTargets, attachMailToTarget, disconnectOutlook, sendOutlookMail, listTargetFiles, getMailAttachment, deleteMail, mailContext, recentAddresses };
