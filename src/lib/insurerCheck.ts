// "Is the at-fault car insured with X?" (Amit, 2026-10-15, Discussion #3).
// Before sending a third-party payment demand the collectors check, insurer
// by insurer, that the at-fault car is really insured there — otherwise a
// month goes by before the "not our insured" answer. Each insurer has a public
// check page (plate + event date); the list below is the one published by the
// Israel Insurance Association (insurance.org.il, "קישורים לבדיקת קיום ביטוח
// רכב לפי מספר רכב פוגע ויום האירוע"). The sites are separate systems, some
// with bot checks and terms that forbid automated queries, so the system
// opens them for the collector (plate and date ready to paste) and records
// the answer — it does not query them itself.

export type InsurerCheck = { name: string; url: string; note?: string; claimName?: string };

export const INSURER_CHECKS: InsurerCheck[] = [
  { name: 'הפניקס', url: 'https://www.fnx.co.il/claims-customer-service/claims-car-insurance/vehicle-third-party-all/' },
  { name: 'הראל', url: 'https://www.harel-group.co.il/Insurance/car/information/calculators/Pages/cover-check.aspx', claimName: 'הראל ביטוח' },
  { name: 'כלל', url: 'https://www.clalbit.co.il/influence/', claimName: 'כלל ביטוח' },
  { name: 'מגדל', url: 'https://www.migdal.co.il/support/car-insurance/third-party-policy-examination', claimName: 'מגדל ביטוח' },
  { name: 'מנורה', url: 'https://www.menoramivt.co.il/CarInsurance/', claimName: 'מנורה מבטחים' },
  { name: 'ביטוח ישיר', url: 'https://www.555.co.il/webapp/~v60/agentstatus/agentstatus.html' },
  { name: 'איילון', url: 'https://myportfolio.ayalon-ins.co.il/AyalonetNew/userLogin/loginNew.aspx' },
  { name: 'הכשרה', url: 'https://www.hcsra.co.il/Pages/covercheckthirdparty.aspx?ver=1', claimName: 'הכשרה ביטוח' },
  { name: 'AIG', url: 'https://www.aig.co.il/car-insurance/policy-check/' },
  { name: 'שלמה ביטוח', url: 'https://www.shlomo-bit.co.il/policy_status' },
  { name: 'שומרה', url: 'https://services.shomera.co.il/gimel/', note: 'ת״ז המבוטח לא חובה' },
  { name: 'ליברה', url: 'https://www.lbr.co.il/%D7%A9%D7%99%D7%A8%D7%95%D7%AA-%D7%95%D7%AA%D7%91%D7%99%D7%A2%D7%95%D7%AA/', note: 'לגלול עד למטה בעמוד' },
  { name: 'WeSure', url: 'https://www.we-sure.co.il/%d7%91%d7%93%d7%99%d7%a7%d7%aa-%d7%aa%d7%95%d7%a7%d7%a3-%d7%94%d7%91%d7%99%d7%98%d7%95%d7%97/' },
  { name: 'קש', url: 'https://user.kesh-ins.co.il/Check_insurance' },
  { name: 'חקלאי', url: 'https://www.bth.co.il/check-insurance/' },
  { name: 'קרנית', url: 'https://www.karnit.co.il/inquiry/', note: 'כשלא נמצא ביטוח בשום חברה' },
];
