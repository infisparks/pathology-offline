import { db } from '@/lib/localdb';

/**
 * Generates a patient ID in the format yyyymmdd-0001.
 * Finds the highest existing sequence for the current day based on local IndexedDB data.
 */
export async function generatePatientIdWithSequence(): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const yearMonthDayPrefix = `${yyyy}${mm}${dd}-` // e.g., 20251020-

  // 1. Get all patient IDs for the current day that match the pattern
  const todayPatients = await db.patientdetail
    .where('patient_id')
    .startsWith(yearMonthDayPrefix)
    .toArray();

  let maxSequence = 0;
  
  // 2. Extract the sequence number and find the max
  todayPatients.forEach(patient => {
    const parts = patient.patient_id.split('-');
    if (parts.length === 2) {
      const sequence = parseInt(parts[1], 10);
      if (!isNaN(sequence) && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  });

  const nextSequence = maxSequence + 1;
  const sequenceStr = String(nextSequence).padStart(4, "0")
  
  return `${yearMonthDayPrefix}${sequenceStr}`
}
