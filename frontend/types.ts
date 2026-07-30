export type ActionType = 'Clock In' | 'Clock Out';

export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  address?: string;
}

export interface ClockEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  locationName?: string;
  action: ActionType;
  timestamp: number;
  location: LocationData | null;
  photoBase64: string;
  photoName: string;
  synced: boolean;
}

export interface Employee {
  id: string;
  name: string;
  locationName?: string;
}

export type ShiftPhase = 'needs_clock_in' | 'needs_clock_out' | 'on_break' | 'day_complete';

export interface ShiftState {
  dateKey: string;
  phase: ShiftPhase;
  firstClockInAt?: number;
  effectiveShiftStartAt?: number;
  breakReminderAt?: number;
  breakReminderSent?: boolean;
  breakStartedAt?: number;
  postBreakClockInAt?: number;
  dayCompletedAt?: number;
  source?: 'local' | 'server';
}