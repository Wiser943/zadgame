// Jobs rules shared by routes + tests. No database access in here.
// One shift = one in-game hour. The game clock moves 1 minute every 3 seconds, so 60 min = 180 s.
const SHIFT_SECONDS = 180;
const MAX_SHIFTS_PER_DAY = 40;      // per Lagos calendar day, stops auto-work from minting endless cash
const WEEKDAYS_ONLY = true;         // "5 days a week": Mon-Fri (Lagos time). Set false to allow weekends.

// ladder[i].shifts = total shifts worked in this job before you are promoted to that rung.
const JOBS = {
  oil: { name: 'Oil & Gas', emoji: '🛢️', blurb: 'Start at the refinery and climb to Managing Director. Steady money.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Operator Trainee', field: 'Refining', pay: 14000, shifts: 0 }, { title: 'Plant Operator', field: 'Refining', pay: 22000, shifts: 60 }, { title: 'Process Engineer', field: 'Refining', pay: 38000, shifts: 180 }, { title: 'Plant Manager', field: 'Operations', pay: 70000, shifts: 400 }, { title: 'Managing Director', field: 'Executive', pay: 160000, shifts: 800 }] },
  tech: { name: 'Tech', emoji: '💻', blurb: 'From Yaba intern to CTO. Coding pushes promotions.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Intern', field: 'Engineering', pay: 9900, shifts: 0 }, { title: 'Junior Developer', field: 'Engineering', pay: 20000, shifts: 40 }, { title: 'Developer', field: 'Engineering', pay: 42000, shifts: 140 }, { title: 'Senior Developer', field: 'Engineering', pay: 90000, shifts: 320 }, { title: 'CTO', field: 'Executive', pay: 220000, shifts: 700 }] },
  banking: { name: 'Banking', emoji: '🏦', blurb: 'Hit your account-opening targets on VI. Charisma is king.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Marketer', field: 'Retail Banking', pay: 11600, shifts: 0 }, { title: 'Relationship Officer', field: 'Retail Banking', pay: 21000, shifts: 50 }, { title: 'Branch Manager', field: 'Branch', pay: 45000, shifts: 170 }, { title: 'Regional Head', field: 'Management', pay: 95000, shifts: 380 }, { title: 'Executive Director', field: 'Executive', pay: 200000, shifts: 750 }] },
  transport: { name: 'Transport', emoji: '🚌', blurb: 'Drive a danfo, beat the go-slow, own the fleet.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Danfo Conductor', field: 'Road', pay: 8000, shifts: 0 }, { title: 'Danfo Driver', field: 'Road', pay: 15000, shifts: 40 }, { title: 'Bus Owner', field: 'Fleet', pay: 34000, shifts: 150 }, { title: 'Fleet Manager', field: 'Fleet', pay: 75000, shifts: 350 }, { title: 'Transport Mogul', field: 'Executive', pay: 170000, shifts: 750 }] },
  fashion: { name: 'Fashion', emoji: '🧵', blurb: 'Sew for owambe season and grow your own label.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Tailor Apprentice', field: 'Tailoring', pay: 7500, shifts: 0 }, { title: 'Tailor', field: 'Tailoring', pay: 16000, shifts: 40 }, { title: 'Designer', field: 'Design', pay: 36000, shifts: 150 }, { title: 'Creative Director', field: 'Design', pay: 80000, shifts: 360 }, { title: 'Fashion House Owner', field: 'Executive', pay: 180000, shifts: 750 }] },
  health: { name: 'Healthcare', emoji: '🩺', blurb: 'Care for patients at LUTH and rise through the ranks.', hours: '1-hour shifts, any time', days: '5 days a week',
    ladder: [{ title: 'Nursing Assistant', field: 'Nursing', pay: 10500, shifts: 0 }, { title: 'Nurse', field: 'Nursing', pay: 20000, shifts: 50 }, { title: 'Doctor', field: 'Medicine', pay: 48000, shifts: 180 }, { title: 'Consultant', field: 'Medicine', pay: 100000, shifts: 420 }, { title: 'Chief Medical Director', field: 'Executive', pay: 210000, shifts: 800 }] }
};
const jobOf = (id) => (Object.prototype.hasOwnProperty.call(JOBS, id) ? JOBS[id] : null);
const levelOf = (job, shifts) => { let l = 0; job.ladder.forEach((r, i) => { if (shifts >= r.shifts) l = i; }); return l; };

// Everything the client needs to draw "YOUR JOB" for a given job id + shifts worked.
function describe(id, shifts = 0) {
  const job = jobOf(id); if (!job) return null;
  const level = levelOf(job, shifts), rung = job.ladder[level], next = job.ladder[level + 1] || null;
  return { id, name: job.name, emoji: job.emoji, title: rung.title, field: rung.field, pay: rung.pay, level, shifts,
    next: next ? { title: next.title, pay: next.pay, shiftsLeft: Math.max(0, next.shifts - shifts), at: next.shifts, from: rung.shifts } : null };
}
const catalogue = () => Object.entries(JOBS).map(([id, j]) => ({ id, name: j.name, emoji: j.emoji, blurb: j.blurb, hours: j.hours, days: j.days, startTitle: j.ladder[0].title, startPay: j.ladder[0].pay }));

const lagos = (ms) => new Date(ms + 3600000);   // Africa/Lagos is UTC+1 all year
const dayKey = (ms) => lagos(ms).toISOString().slice(0, 10);
// Returns an error message when the player cannot work right now, otherwise null.
function offDuty(ms) { const d = lagos(ms).getUTCDay(); return WEEKDAYS_ONLY && (d === 0 || d === 6) ? 'Weekend! Your job is closed until Monday.' : null; }
module.exports = { SHIFT_SECONDS, MAX_SHIFTS_PER_DAY, WEEKDAYS_ONLY, JOBS, jobOf, levelOf, describe, catalogue, dayKey, offDuty };
