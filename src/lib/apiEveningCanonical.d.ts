import './api.ts';
import type { EveningAttendanceFact, EveningResponseStatus } from './eveningResponse.ts';

declare module './api.ts' {
  interface EveningParticipant {
    /** Canonical player intent for the evening. Legacy registration_status is fallback-only. */
    response_status: EveningResponseStatus;
    attendance_fact?: EveningAttendanceFact;
  }
}
