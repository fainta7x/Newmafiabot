import './api.ts';
import type { EveningAttendanceFact, EveningResponseStatus } from './eveningResponse.ts';

declare module './api.ts' {
  interface EveningParticipant {
    response_status?: EveningResponseStatus;
    attendance_fact?: EveningAttendanceFact;
  }
}
